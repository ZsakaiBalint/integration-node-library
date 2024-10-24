/**
 * Integration driver API for Unfolded Circle Remote devices.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

import os from "os";
import Bonjour from "bonjour-service";
import WebSocket from "ws";
import { WebSocketServer } from "ws";
import { EventEmitter } from "events";
import fs from "fs";
import * as uc from "./lib/api_definitions.js";
import Entities, { Entity } from "./lib/entities/entities.js";
import { toLanguageObject, getDefaultLanguageString } from "./lib/utils.js";
import log from "./lib/loggers.js";
import { STATUS_CODES } from "http";
import { SetupAction, DriverSetupRequest, UserDataResponse, } from './lib/api_definitions.js';


interface Developer {
  name: string;
}

interface DriverInfo {
  driver_url: string;  
  port: number;               
  driver_id: string;        
  name: Record<string, string>; 
  version: string;            
  developer: Developer;      
  min_core_api: string | null; 
}

class IntegrationAPI extends EventEmitter {

  private configDirPath : string;
  private driverPath : string;
  private driverInfo: DriverInfo;
  private state: uc.DEVICE_STATES;
  private server: WebSocket.Server;
  private clients: Map<WebSocket, any>;
  private setupHandler : any;
  private availableEntities : Entities;
  private configuredEntities : Entities;

  constructor() {
    super();







    this.driverInfo = {
      driver_url: "",
      port: 0,
      driver_id: "",
      name: {},
      version: "",
      developer: { name: "" },
      min_core_api: null,
    };
    this.server = new WebSocketServer({ noServer: true });









    this.driverPath = "driver.json";

    // directory to store configuration files
    this.configDirPath = process.env.UC_CONFIG_HOME || process.env.HOME || "./";

    // set default state to connected
    this.state = uc.DEVICE_STATES.DISCONNECTED;

    this.clients = new Map();

    // create storage for available and configured entities
    this.availableEntities = new Entities("available");
    this.configuredEntities = new Entities("configured");

    // connect to update events for entity attributes
    this.configuredEntities.on(uc.EVENTS.ENTITY_ATTRIBUTES_UPDATED, async (entityId, entityType, attributes) => {
      const data = {
        entity_id: entityId,
        entity_type: entityType,
        attributes: attributes instanceof Map ? Object.fromEntries(attributes) : attributes
      };

      await this.#broadcastEvent(uc.MSG_EVENTS.ENTITY_CHANGE, data, uc.EVENT_CATEGORY.ENTITY);
    });
  }

  /**
   * Initialize the library
   * @param {string|object} driverConfig either a string to specify the driver configuration file path, or an object holding the configuration
   * @param setupHandler optional driver setup handler if the driver metadata contains a setup_data_schema object
   */
  init(
      driverConfig: string|object, 
      setupHandler?: (msg: DriverSetupRequest | UserDataResponse) => Promise<SetupAction>
    ) {
    this.setupHandler = setupHandler;
    const integrationInterface = process.env.UC_INTEGRATION_INTERFACE;
    const integrationPort = process.env.UC_INTEGRATION_HTTP_PORT;
    // TODO: implement wss
    // const integrationHttpsEnabled = process.env.UC_INTEGRATION_HTTPS_ENABLED === "true";
    const disableMdnsPublish = process.env.UC_DISABLE_MDNS_PUBLISH === "true";

    // load driver information from either a file path or object.
    if (typeof driverConfig === "string") {
      this.driverPath = driverConfig;

      let raw: string | Buffer;
      try {
        raw = fs.readFileSync(this.driverPath);
      } catch (e) {
        throw Error(`Cannot load ${this.driverPath}: ${e}`);
      }

      try {
        this.driverInfo = JSON.parse(String(raw));
        log.debug("Driver info loaded");
      } catch (e) {
        log.error(`Error parsing driver info: ${e}`);
        throw Error("Error parsing driver info");
      }
    } else if (typeof driverConfig === "object") {
      this.driverInfo = createDriverInfo(driverConfig);
    } else {
      throw Error("Unsupported driverConfig");
    }

    this.driverInfo.driver_url = this.#getDriverUrl(this.driverInfo.driver_url, this.driverInfo.port);

    if (!disableMdnsPublish) {
      let bonjour = new Bonjour.default()
      log.debug("Starting mdns advertising");

      // Make sure to advertise a .local hostname. It seems that bonjour just blindly takes the hostname, short or FQDN.
      // The remote only supports multicast DNS resolution in the .local domain.
      // Test with: avahi-browse -d local _uc-integration._tcp --resolve -t
      const hostname = os.hostname().split(".")[0] + ".local.";

      bonjour.publish({
        name: this.driverInfo.driver_id,
        host: hostname,
        type: "uc-integration",
        port: Number(integrationPort) || this.driverInfo.port || 9090,
        txt: {
          name: getDefaultLanguageString(this.driverInfo.name, "Unknown driver"),
          ver: this.driverInfo.version,
          developer: this.driverInfo.developer.name
        }
      });
    }

    // TODO #5 handle startup errors if e.g. port is already in use
    // setup websocket server - remote-core will connect to this
    const port = integrationPort || this.driverInfo.port || 9090;
    if (integrationInterface) {
      this.server = new WebSocketServer({
        host: integrationInterface,
        port: Number(port)
      });
    } else {
      this.server = new WebSocketServer({
        port: Number(port)
      });
    }

    this.server.on("connection", (connection, req) => {
      const wsId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;

      log.info(`[${wsId}] WS: New connection`);

      // more metadata in the future, e.g. authentication info etc
      const metadata = { id: wsId, authenticated: true };

      this.clients.set(connection, metadata);

      this.#authentication(wsId, true);

      connection.on("message", async (message) => {
        await this.#messageReceived(wsId, String(message));
      });

      connection.on("close", () => {
        log.info(`[${wsId}] WS: Connection closed`);
        this.clients.delete(connection);
      });

      connection.on("error", () => {
        log.warn(`[${wsId}] WS: Connection error`);
        this.clients.delete(connection);
      });
    });

    log.info(
      "Driver is up: %s, version: %s, listening on: %s:%d",
      this.driverInfo.driver_id,
      this.driverInfo.version,
      integrationInterface || "0.0.0.0",
      port
    );
  }

  public getConfigDirPath() : string {
    return this.configDirPath;
  }

  /**
   * Rewrite WebSocket server URL to include in the `driver_metadata` response.
   *
   * - If null or empty: null is returned and propagated to the metadata. The remote uses the mDNS information.
   * - If starting with `ws://` or `wss://` the url is returned as defined.
   * - Otherwise: build URL from OS hostname and given port number.
   *
   * @param {string} url The WebSocket url. Usually defined in the driver.json file. May be null or empty.
   * @param {number} port The WebSocket server port number.
   * @returns {string} The WebSocket server url which should be returned in `driver_metadata`.
   */
  #getDriverUrl(url: string, port: Number) {
    if (url) {
      if (url.startsWith("ws://") || url.startsWith("wss://")) {
        return url;
      }
      return `ws://${os.hostname()}:${port}`;
    }

    // Remote will use mDNS information
    return "";
  }

  /**
   * Retrieve the corresponding WebSocket connection from an identifier.
   *
   * @param {string} id The websocket identifier.
   * @returns {any | null} The WebSocket connection or null if not found.
   */
  #getWsConnection(id: string): any | null {
    for (const [connection, metadata] of this.clients.entries()) {
      if (metadata.id === id) {
        return connection;
      }
    }

    return null;
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  async #sendOkResult(wsId: any, id: any, msgData = {}) {
    await this.#sendResponse(wsId, id, "result", msgData, 200);
  }

  async #sendErrorResult(wsId: any, id: any, statusCode = 500, msgData = {}) {
    await this.#sendResponse(wsId, id, "result", msgData, statusCode);
  }

  // TODO return send result, connection.send error handling
  // send a response to a request
  async #sendResponse(wsId: string, id: any, msg: any, msgData: any, statusCode = uc.STATUS_CODES.OK) {
    const json = {
      kind: "resp",
      req_id: id,
      code: statusCode,
      msg,
      msg_data: msgData
    };

    const connection = this.#getWsConnection(wsId);
    if (connection != null) {
      const response = JSON.stringify(json);
      this.#log_json_message(json, `[${wsId}] <- `);

      connection.send(response);
    } else {
      log.warn(`[${wsId}] Error sending response: connection no longer established`);
    }
  }

  /**
   * Broadcast an event to all connected clients
   *
   * @param {string} msg  The message name
   * @param {object} msgData The message payload in `msg_data`
   * @param {string} category The event category
   */
  async #broadcastEvent(msg: string, msgData: object, category: string) {
    const json = {
      kind: "event",
      msg,
      msg_data: msgData,
      cat: category
    };

    const response = JSON.stringify(json);
    this.#log_json_message(json, "<<- ");

    [...this.clients.keys()].forEach((client) => {
      client.send(response);
    });
  }

  /**
   * Send an event message to the given client.
   *
   * @param {string} wsId WebSocket identifier
   * @param {string} msg  The message name
   * @param {object} msgData The message payload in `msg_data`
   * @param {string} category The event category
   */
  async #sendEvent(wsId: string, msg: string, msgData: object, category: string) {
    const json = {
      kind: "event",
      msg,
      msg_data: msgData,
      cat: category
    };

    const connection = this.#getWsConnection(wsId);
    if (connection != null) {
      const response = JSON.stringify(json);
      this.#log_json_message(json, `[${wsId}] <- `);

      connection.send(response);
    } else {
      log.warn(`[${wsId}] Error sending event: connection no longer established`);
    }
  }

  // process incoming websocket messages
  async #messageReceived(wsId: string, message: string) {
    let json;
    try {
      json = JSON.parse(message);
    } catch (e) {
      log.error(`[${wsId}] Json parse error: ${e}`);
      return;
    }

    if (log.msgTrace.enabled) {
      log.msgTrace(`[${wsId}] -> ${JSON.stringify(json)}`);
    }

    const kind = json.kind;
    const id = json.id;
    const msg = json.msg;
    const msgData = json.msg_data;

    if (kind === "req") {
      switch (msg) {
        case uc.MESSAGES.GET_DRIVER_VERSION:
          await this.#sendResponse(wsId, id, uc.MSG_EVENTS.DRIVER_VERSION, this.getDriverVersion());
          break;

        case uc.MESSAGES.GET_DEVICE_STATE:
          await this.#sendResponse(wsId, id, uc.MSG_EVENTS.DEVICE_STATE, this.#getDeviceState());
          break;

        case uc.MESSAGES.GET_AVAILABLE_ENTITIES:
          await this.#sendResponse(wsId, id, uc.MSG_EVENTS.AVAILABLE_ENTITIES, {
            available_entities: this.#getAvailableEntities()
          });
          break;

        case uc.MESSAGES.GET_ENTITY_STATES:
          await this.#sendResponse(wsId, id, uc.MSG_EVENTS.ENTITY_STATES, this.#getEntityStates());
          break;

        case uc.MESSAGES.ENTITY_COMMAND:
          await this.#entityCommand(wsId, id, msgData);
          break;

        case uc.MESSAGES.SUBSCRIBE_EVENTS:
          await this.#subscribeEvents(msgData);
          await this.#sendOkResult(wsId, id);
          break;

        case uc.MESSAGES.UNSUBSCRIBE_EVENTS:
          await this.#unSubscribeEvents(msgData);
          await this.#sendOkResult(wsId, id);
          break;

        case uc.MESSAGES.GET_DRIVER_METADATA:
          await this.#sendResponse(wsId, id, uc.MSG_EVENTS.DRIVER_METADATA, this.driverInfo);
          break;

        case uc.MESSAGES.SETUP_DRIVER:
          if (!(await this.#setupDriver(wsId, id, msgData))) {
            await this.driverSetupError({ wsId, id });
          }
          break;

        case uc.MESSAGES.SET_DRIVER_USER_DATA:
          if (!(await this.#setDriverUserData(wsId, id, msgData))) {
            await this.driverSetupError({ wsId, id });
          }
          break;

        default:
          log.warn(`[${wsId}] Unhandled request: ${msg}`);
          await this.#sendErrorResult(wsId, id);
          break;
      }
    } else if (kind === "event") {
      switch (msg) {
        case uc.MSG_EVENTS.CONNECT:
          this.emit(uc.EVENTS.CONNECT);
          break;

        case uc.MSG_EVENTS.DISCONNECT:
          this.emit(uc.EVENTS.DISCONNECT);
          break;

        case uc.MSG_EVENTS.ENTER_STANDBY:
          this.emit(uc.EVENTS.ENTER_STANDBY);
          break;

        case uc.MSG_EVENTS.EXIT_STANDBY:
          this.emit(uc.EVENTS.EXIT_STANDBY);
          break;

        case uc.MSG_EVENTS.ABORT_DRIVER_SETUP:
          this.emit(uc.EVENTS.SETUP_DRIVER_ABORT);
          break;

        default:
          log.warn(`[${wsId}] Unhandled event: ${msg}`);
          break;
      }
    }
  }

  /**
   * Log a JSON message with a prefix text.
   *
   * Base64 encoded images starting with `data:` are removed in `msg_data.attributes.media_image_url`
   * fields to limit log output.
   * The `msg_data` object may either be a single object or an array of objects.
   *
   * @param {Record<string, any>} json The JSON message to log.
   * @param {string} prefix Prefix text to add before the JSON message.
   */
  #log_json_message(json: object, prefix: string) {
    if (!log.msgTrace.enabled) {
      return;
    }
    log.msgTrace(`${prefix} ${JSON.stringify(json)}`);
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

  // private methods
  #authentication(wsId: string, success: any) {
    this.#sendResponse(
      wsId,
      0,
      uc.MESSAGES.AUTHENTICATION,
      {},
      success ? uc.STATUS_CODES.OK : uc.STATUS_CODES.UNAUTHORIZED
    );
  }

  #getDeviceState() {
    return {
      state: this.state
    };
  }

  #getAvailableEntities() {
    // return list of entities
    return this.availableEntities.getEntities();
  }

  async #subscribeEvents(entities: any) {
    entities.entity_ids.forEach((entityId : any) => {
      const entity = this.availableEntities.getEntity(entityId);
      if (entity) {
        this.configuredEntities.addEntity(entity);
      } else {
        log.warn(`WARN: cannot subscribe entity '${entityId}': entity is not available`);
      }
    });

    this.emit(uc.EVENTS.SUBSCRIBE_ENTITIES, entities.entity_ids);
  }

  async #unSubscribeEvents(entities: any) {
    // remove entities from registered entities
    let res = true;

    entities.entity_ids.forEach((entityId : any) => {
      if (!this.configuredEntities.removeEntity(entityId)) {
        res = false;
      }
    });

    this.emit(uc.EVENTS.UNSUBSCRIBE_ENTITIES, entities.getEntityIds());

    return res;
  }

  #getEntityStates() {
    // simply return entity states from configured entities
    return this.configuredEntities.getStates();
  }

  async #entityCommand(wsId : any, reqId : any, data : any) {
    const wsHandle = { wsId, reqId };

    if (!data) {
      log.warn("Ignoring entity command: called with empty msg_data");
      await this.acknowledgeCommand(wsHandle, uc.STATUS_CODES.BAD_REQUEST);
      return;
    }

    const entityId = data.entity_id; // "entity_id" in data ? data.entity_id : undefined;
    const cmdId = data.cmd_id; // "cmd_id" in data ? data.cmd_id : undefined;
    if (!entityId || !cmdId) {
      log.warn("Ignoring command: missing entity_id or cmd_id");
      await this.acknowledgeCommand(wsHandle, uc.STATUS_CODES.BAD_REQUEST);
      return;
    }

    const entity = this.configuredEntities.getEntity(entityId);
    if (!entity) {
      log.warn("Cannot execute command '%s' for '%s': no configured entity found", cmdId, entityId);
      await this.acknowledgeCommand(wsHandle, uc.STATUS_CODES.NOT_FOUND);
      return;
    }

    if (!entity.hasCmdHandler) {
      // legacy: emit event, so the driver can act on it
      log.warn(
        `DEPRECATED no entity command handler provided for ${data.entity_id} by the driver: please migrate the integration driver, the legacy ENTITY_COMMAND event will be removed in a future release!`
      );
      this.emit(uc.EVENTS.ENTITY_COMMAND, wsHandle, data.entity_id, data.entity_type, data.cmd_id, data.params);
    } else {
      const result = await entity.command(cmdId, "params" in data ? data.params : undefined);
      const resultEnumValue = STATUS_CODES[result as keyof typeof STATUS_CODES];
      await this.acknowledgeCommand(wsHandle);
    }
  }

  async #setupDriver(wsId: any, reqId: any, data: { setup_data: { [key: string]: string; }; reconfigure: any; }) {
    const wsHandle = { wsId, reqId };

    if (this.setupHandler) {
      await this.acknowledgeCommand(wsHandle);
    }

    if (!data || !data.setup_data) {
      log.error("Aborting setup_driver: called with empty msg_data");
      return false;
    }
    const reconfigure = data.reconfigure && typeof data.reconfigure === "boolean" ? data.reconfigure : false;

    // legacy: emit event, so the driver can act on it
    if (!this.setupHandler) {
      log.warn(
        "DEPRECATED no setup handler provided by the driver: please migrate the integration driver, the legacy SETUP_DRIVER, SETUP_DRIVER_USER_DATA, SETUP_DRIVER_USER_CONFIRMATION events will be removed in a future release!"
      );
      this.emit(uc.EVENTS.SETUP_DRIVER, wsHandle, data.setup_data, reconfigure);
      return true;
    }

    // new setupHandler logic as in Python integration library
    let result = false;
    try {
      const action = await this.setupHandler(new uc.setup.DriverSetupRequest(reconfigure, data.setup_data));

      if (action instanceof uc.setup.RequestUserInput) {
        await this.driverSetupProgress(wsHandle);
        await this.requestDriverSetupUserInput(wsHandle, action.title, action.settings);
        result = true;
      } else if (action instanceof uc.setup.RequestUserConfirmation) {
        await this.driverSetupProgress(wsHandle);
        await this.requestDriverSetupUserConfirmation(
          wsHandle,
          action.title,
          String(action.header),
          undefined,
          String(action.footer)
        );
        result = true;
      } else if (action instanceof uc.setup.SetupComplete) {
        await this.driverSetupComplete(String(wsHandle));
        result = true;
      } else if (action instanceof uc.setup.SetupError) {
        await this.driverSetupError(wsHandle, action.errorType);
        result = true;
      }
      // TODO define custom exceptions?
    } catch (ex) {
      log.error("Exception in setup handler, aborting setup!", ex);
    }

    return result;
  }

  async #setDriverUserData(wsId: any, reqId: any, data: { input_values: { [key: string]: string; }; confirm: boolean; }) {
    const wsHandle = { wsId, reqId };

    if (this.setupHandler) {
      await this.acknowledgeCommand(wsHandle);
    }

    if (!data || !(data.input_values || data.confirm)) {
      log.warn("Unsupported set_driver_user_data payload received: %s", data);
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.driverSetupProgress(wsHandle);

    // legacy: emit event, so the driver can act on it
    if (!this.setupHandler) {
      if (data.input_values) {
        this.emit(uc.EVENTS.SETUP_DRIVER_USER_DATA, wsHandle, data.input_values);
        return true;
      } else if (data.confirm) {
        this.emit(uc.EVENTS.SETUP_DRIVER_USER_CONFIRMATION, wsHandle);
        return true;
      } else {
        log.warn("Unsupported set_driver_user_data payload received");
      }

      return false;
    }

    // new setupHandler logic as in Python integration library
    let result = false;
    try {
      let action = new uc.setup.SetupError();
      if (data.input_values) {
        action = await this.setupHandler(new uc.setup.UserDataResponse(data.input_values));
      } else if (data.confirm) {
        action = await this.setupHandler(new uc.setup.UserConfirmationResponse(data.confirm));
      }

      if (action instanceof uc.setup.RequestUserInput) {
        await this.requestDriverSetupUserInput(wsHandle, action.title, action.settings);
        result = true;
      } else if (action instanceof uc.setup.RequestUserConfirmation) {
        await this.requestDriverSetupUserConfirmation(
          wsHandle,
          action.title,
          String(action.header),
          undefined,
          String(action.footer)
        );
        result = true;
      } else if (action instanceof uc.setup.SetupComplete) {
        await this.driverSetupComplete(wsHandle.wsId);
        result = true;
      } else if (action instanceof uc.setup.SetupError) {
        await this.driverSetupError(wsHandle, action.errorType);
        result = true;
      }

      // TODO define custom exceptions?
    } catch (ex) {
      log.error("Exception in setup handler, aborting setup!", ex);
    }

    return result;
  }

  /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
  getDriverVersion() {
    return {
      name: this.driverInfo.name.en,
      version: {
        api: this.driverInfo.min_core_api,
        driver: this.driverInfo.version
      }
    };
  }

  async setDeviceState(state : any) {
    this.state = state;

    await this.#broadcastEvent(
      uc.MSG_EVENTS.DEVICE_STATE,
      {
        state: this.state
      },
      uc.EVENT_CATEGORY.DEVICE
    );
  }

  /**
   * Acknowledge a received command event it was successfully executed or not.
   *
   * @param {Object} wsHandle The WebSocket handle received in the ENTITY_COMMAND event.
   * @param {Number} statusCode The status code. Defaults to OK 200.
   */
  async acknowledgeCommand(wsHandle: { wsId: any; reqId: any; }, statusCode = uc.STATUS_CODES.OK) {
    await this.#sendResponse(wsHandle.wsId, wsHandle.reqId, "result", {}, statusCode);
  }

  /**
   * Send a setup progress message during the driver setup flow.
   *
   * @param {Object} wsHandle The WebSocket handle received in the `EVENTS.SETUP_DRIVER` event.
   */
  async driverSetupProgress(wsHandle : any) {
    const msgData = {
      event_type: "SETUP",
      state: "SETUP"
    };
    await this.#sendEvent(wsHandle.wsId, uc.MSG_EVENTS.DRIVER_SETUP_CHANGE, msgData, uc.EVENT_CATEGORY.DEVICE);
  }

  /**
   * Request a user confirmation during the driver setup flow.
   *
   * @param {Object} wsHandle The WebSocket handle received in the `EVENTS.SETUP_DRIVER` event.
   * @param {string|Map} title A human-readable title of the request screen. Either a string, which will be mapped to english, or a Map containing multiple language strings.
   * @param {string|Map} msg1 The optional message to display in the request screen. Either a string or a language map.
   * @param {string} image An optional base64 encoded image to display below `msg1`.
   * @param {string|Map} msg2 An optional message to display in the request screen below `msg1` or `image`. Either a string or a language map.
   */
  async requestDriverSetupUserConfirmation(wsHandle: { wsId: any; reqId?: any; }, title: string | Map<string, string> | { [key: string]: string; }, msg1 : string, image = undefined, msg2 : string) {
    const msgData = {
      event_type: "SETUP",
      state: "WAIT_USER_ACTION",
      require_user_action: {
        confirmation: {
          title: toLanguageObject(title),
          message1: toLanguageObject(msg1),
          image,
          message2: toLanguageObject(msg2)
        }
      }
    };
    await this.#sendEvent(wsHandle.wsId, uc.MSG_EVENTS.DRIVER_SETUP_CHANGE, msgData, uc.EVENT_CATEGORY.DEVICE);
  }

  /**
   * Request user input during the driver setup flow.
   *
   * @param {Object} wsHandle The WebSocket handle received in the `EVENTS.SETUP_DRIVER` event.
   * @param {string|Map<string, string>|Object<string, string>} title A human-readable title of the request screen. Either a string, which will be mapped to english, or a Map / Object containing multiple language strings.
   * @param {Array<object>} settings Array of input field definition objects. See Integration-API specification.
   */
  async requestDriverSetupUserInput(wsHandle: { wsId: any; reqId?: any; }, title: string | Map<string, string> | { [key: string]: string; }, settings: { [key: string]: any; }[]) {
    const msgData = {
      event_type: "SETUP",
      state: "WAIT_USER_ACTION",
      require_user_action: {
        input: {
          title: toLanguageObject(title),
          settings
        }
      }
    };
    await this.#sendEvent(wsHandle.wsId, uc.MSG_EVENTS.DRIVER_SETUP_CHANGE, msgData, uc.EVENT_CATEGORY.DEVICE);
  }

  /**
   * Confirm successful setup flow completion.
   *
   * Further setup flow messages will be ignored by the Remote.
   *
   * @param {string} wsHandle The WebSocket handle received in the `EVENTS.SETUP_DRIVER` event.
   */
  async driverSetupComplete(wsHandle: string) {
    const msgData = {
      event_type: "STOP",
      state: "OK"
    };
    await this.#sendEvent(wsHandle, uc.MSG_EVENTS.DRIVER_SETUP_CHANGE, msgData, uc.EVENT_CATEGORY.DEVICE);
  }

  /**
   * Set the driver setup flow as failed.
   *
   * Further setup flow messages will be ignored by the Remote.
   *
   * @param {Object} wsHandle The WebSocket handle received in the `EVENTS.SETUP_DRIVER` event.
   * @param {string} error The error reason. TODO create enum.
   */
  async driverSetupError(wsHandle: { wsId: any; id?: any; reqId?: any; }, error: string = "OTHER") {
    const msgData = {
      event_type: "STOP",
      state: "ERROR",
      error
    };
    await this.#sendEvent(wsHandle.wsId, uc.MSG_EVENTS.DRIVER_SETUP_CHANGE, msgData, uc.EVENT_CATEGORY.DEVICE);
  }

  public getConfiguredEntities(): Entities {
    return this.configuredEntities;
  }

  public getAvailableEntities(): Entities {
    return this.availableEntities;
  }

  public addEntity(entity: Entity) {
    this.availableEntities.addEntity(entity);
  }

  public clearAvailableEntities(): void {
    this.availableEntities.clear();
  }

  public clearConfiguredEntities(): void {
    this.configuredEntities.clear();
  }

  public updateEntityAttributes(entityId : string, attributes: Map<string, any> | Record<string, any>): boolean {
    return this.configuredEntities.updateEntityAttributes(entityId, attributes);
  }
}

export default new IntegrationAPI();

function createDriverInfo(driverConfig: object): DriverInfo {
  throw new Error("Function not implemented.");
}
