/**
 * Cover-entity definitions.
 * See <https://github.com/unfoldedcircle/core-api/tree/main/doc/entities> for more information.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

import { CommandHandler, Types as EntityTypes, EntityName } from "./entity.js";
import { Entity } from "./entity.js";
import log from "../loggers.js";

// Cover entity states
export enum States {
  Unavailable = "UNAVAILABLE",
  Unknown = "UNKNOWN",
  Opening = "OPENING",
  Open = "OPEN",
  Closing = "CLOSING",
  Closed = "CLOSED"
}

// Cover entity features
export enum Features {
  Open = "open",
  Close = "close",
  Stop = "stop",
  Position = "position",
  Tilt = "tilt",
  TiltStop = "tilt_stop",
  TiltPosition = "tilt_position"
}

// Cover entity attributes
export enum Attributes {
  State = "state",
  Position = "position",
  TiltPosition = "tilt_position"
}

// Cover entity commands
export enum Commands {
  Open = "open",
  Close = "close",
  Stop = "stop",
  Position = "position",
  Tilt = "tilt",
  TiltUp = "tilt_up",
  TiltDown = "tilt_down",
  TiltStop = "tilt_stop"
}

// Cover entity device classes
export enum DeviceClasses {
  Blind = "blind",
  Curtain = "curtain",
  Garage = "garage",
  Shade = "shade",
  Door = "door",
  Gate = "gate",
  Window = "window"
}

// Cover entity options
export enum Options {}

// Define types for the parameters in the constructor
interface CoverParams {
  features?: string[];
  attributes?: Partial<Record<Attributes, States | number | boolean | string>>;
  deviceClass?: string;
  options?: Partial<Record<Options, number | string | boolean>> | null;
  area?: string;
  cmdHandler?: CommandHandler | null;
}

export class Cover extends Entity {
  /**
   * Constructs a new cover entity.
   *
   * @param {string} id The entity identifier. Must be unique inside the integration driver.
   * @param {EntityName} name The human-readable name of the entity.
   *        Either a string, which will be mapped to English, or a Map / Object containing multiple language strings.
   * @param {CoverParams} [params] Entity parameters.
   * @throws AssertionError if invalid parameters are specified.
   */
  constructor(
    id: string,
    name: EntityName,
    { features = [], attributes = {}, deviceClass, options = null, area, cmdHandler }: CoverParams = {}
  ) {
    super(id, name, EntityTypes.Cover, { features, attributes, deviceClass, options, area, cmdHandler });

    log.debug(`Cover entity created with id: ${this.id}`);
  }
}
