/**
 * Common entity definitions.
 * See <https://github.com/unfoldedcircle/core-api/tree/main/doc/entities> for more information.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */
"use strict";
import { STATUS_CODES } from "../api_definitions.js";
import { toLanguageObject } from "../utils.js";
import log from "../loggers.js";
import assert from "node:assert";
/**
 * Available entity types.
 */
var TYPES;
(function (TYPES) {
    TYPES["COVER"] = "cover";
    TYPES["BUTTON"] = "button";
    TYPES["CLIMATE"] = "climate";
    TYPES["LIGHT"] = "light";
    TYPES["MEDIA_PLAYER"] = "media_player";
    TYPES["REMOTE"] = "remote";
    TYPES["SENSOR"] = "sensor";
    TYPES["SWITCH"] = "switch";
})(TYPES || (TYPES = {}));
class Entity {
    id;
    name;
    entity_type;
    device_id;
    features;
    attributes;
    device_class;
    options;
    area;
    cmdHandler;
    /**
     * Constructs a new entity.
     *
     * @param id The entity identifier. Must be unique inside the integration driver.
     * @param name The human-readable name of the entity. Either a string or an object containing multiple language strings.
     * @param entityType One of the defined entity types.
     * @param params Entity parameters.
     */
    constructor(id, name, entityType, { features = [], attributes = {}, deviceClass, options = null, area, cmdHandler = null } = {}) {
        assert(typeof id === "string", "Entity parameter id must be a string");
        this.id = id;
        this.name = toLanguageObject(name); // Assuming toLanguageObject converts to the appropriate structure
        assert(typeof entityType === "string", "Entity parameter entityType must be a string");
        this.entity_type = entityType;
        this.device_id = null; // not yet supported
        assert(Array.isArray(features), "Entity parameter features must be an Array");
        this.features = features;
        assert(attributes instanceof Map || typeof attributes === "object", "Entity parameter attributes must be a Map or Object");
        /*
        if (attributes instanceof Map) {
          this.attributes = attributes;
        } else {
          this.attributes = new Map(Object.entries(attributes || {}));
        }
          */
        this.attributes = attributes instanceof Map ? Object.fromEntries(attributes) : { ...attributes };
        assert(deviceClass === undefined || typeof deviceClass === "string", "Entity parameter deviceClass must be a string");
        this.device_class = deviceClass;
        assert(options === null || typeof options === "object", "Entity parameter options must be an Object");
        this.options = options;
        assert(area === undefined || typeof area === "string", "Entity parameter area must be a string");
        this.area = area;
        assert(cmdHandler === null || typeof cmdHandler === "function", "Entity parameter cmdHandler must be a function");
        this.cmdHandler = cmdHandler;
    }
    /**
     * Set callback handler for entity command requests.
     * @param cmdHandler Callback handler for entity commands.
     */
    setCmdHandler(cmdHandler) {
        this.cmdHandler = cmdHandler;
    }
    /**
     * @return true if a callback handler for entity commands has been installed.
     */
    get hasCmdHandler() {
        return this.cmdHandler !== undefined && this.cmdHandler !== null;
    }
    /**
     * Execute entity command with the installed command handler.
     *
     * Returns NOT_IMPLEMENTED if no command handler is installed.
     * @param cmdId the command
     * @param params optional command parameters
     * @return command status code to acknowledge to UC Remote
     */
    async command(cmdId, params) {
        if (this.cmdHandler) {
            return await this.cmdHandler(this, cmdId, params);
        }
        log.warn("No command handler for %s: cannot execute command '%s' %s", this.id, cmdId, params || "");
        return STATUS_CODES.NOT_IMPLEMENTED.toString();
    }
}
export default Entity;
export { TYPES };
