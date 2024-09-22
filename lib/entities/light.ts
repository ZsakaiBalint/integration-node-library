/**
 * Light-entity definitions.
 * See <https://github.com/unfoldedcircle/core-api/tree/main/doc/entities> for more information.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

import { TYPES as ENTITYTYPES } from './entity';
import { toLanguageObject } from "../utils";
import Entity from "./entity";
import log from "../loggers";

/**
 * Light entity states.
 */
enum STATES {
  UNAVAILABLE = "UNAVAILABLE",
  UNKNOWN = "UNKNOWN",
  ON = "ON",
  OFF = "OFF"
};

/**
 * Light entity features.
 */
enum FEATURES {
  ON_OFF = "on_off",
  TOGGLE = "toggle",
  DIM = "dim",
  COLOR = "color",
  COLOR_TEMPERATURE = "color_temperature"
};

/**
 * Light entity attributes.
 */
enum ATTRIBUTES {
  STATE = "state",
  HUE = "hue",
  SATURATION = "saturation",
  BRIGHTNESS = "brightness",
  COLOR_TEMPERATURE = "color_temperature"
};

/**
 * Light entity commands.
 */
enum COMMANDS {
  ON = "on",
  OFF = "off",
  TOGGLE = "toggle"
};

/**
 * Light entity device classes.
 */
const DEVICECLASSES: Record<string, any> = {};

/**
 * Light entity options.
 */
enum OPTIONS { 
  COLOR_TEMPERATURE_STEPS = "color_temperature_steps" 
};

interface LightParams {
  features?: string[];
  attributes?: Map<string, any> | Record<string, any>;
  deviceClass?: string;
  options?: Record<string, any>;
  area?: string;
  cmdHandler?: (entity: Entity, command: string, params?: Record<string, any>) => Promise<string> | null;
}

/**
 * See {@link https://github.com/unfoldedcircle/core-api/blob/main/doc/entities/entity_light.md light entity documentation}
 * for more information.
 */
class Light extends Entity {
  /**
   * Constructs a new light entity.
   *
   * @param {string} id The entity identifier. Must be unique inside the integration driver.
   * @param {string | Map<string, string> | Record<string, string>} name The human-readable name of the entity.
   *        Either a string, which will be mapped to English, or a Map / Object containing multiple language strings.
   * @param {LightParams} [params] Entity parameters.
   * @throws AssertionError if invalid parameters are specified.
   */
  constructor(
    id: string,
    name: string | Map<string, string> | Record<string, string>,
    { features = [], attributes = {}, deviceClass, options = {}, area}: LightParams = {}
  ) {
    super(id, toLanguageObject(name), ENTITYTYPES.LIGHT, { features, attributes, deviceClass, options, area });

    log.debug(`Light entity created with id: ${this.id}`);
  }
}

export default Light;
export { STATES, FEATURES, ATTRIBUTES, COMMANDS, DEVICECLASSES, OPTIONS};