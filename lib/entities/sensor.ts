/**
 * Sensor-entity definitions.
 * See <https://github.com/unfoldedcircle/core-api/tree/main/doc/entities> for more information.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

import { TYPES as ENTITYTYPES } from "./entity.js";
import Entity from "./entity.js";
import log from "../loggers.js";

/**
 * Sensor entity states.
 */
enum STATES {
  UNAVAILABLE = "UNAVAILABLE",
  UNKNOWN = "UNKNOWN",
  ON = "ON"
}

/**
 * Sensor entity features.
 */
const FEATURES: Record<string, boolean> = {};

/**
 * Sensor entity attributes.
 */
enum ATTRIBUTES {
  STATE = "state",
  VALUE = "value",
  UNIT = "unit"
}

/**
 * Sensor entity commands.
 */
const COMMANDS: Record<string, boolean> = {};

/**
 * Sensor entity device classes.
 */
enum DEVICECLASSES {
  CUSTOM = "custom",
  BATTERY = "battery",
  CURRENT = "current",
  ENERGY = "energy",
  HUMIDITY = "humidity",
  POWER = "power",
  TEMPERATURE = "temperature",
  VOLTAGE = "voltage"
}

/**
 * Sensor entity options.
 */
enum OPTIONS {
  CUSTOM_UNIT = "custom_unit",
  NATIVE_UNIT = "native_unit",
  DECIMALS = "decimals",
  MIN_VALUE = "min_value",
  MAX_VALUE = "max_value"
}

interface SensorParams {
  attributes?: Partial<Record<ATTRIBUTES, STATES | number | boolean | string>>;
  deviceClass?: DEVICECLASSES;
  options?: Partial<Record<OPTIONS, number | string | boolean>> | null;
  area?: string;
}

class Sensor extends Entity {
  /**
   * Constructs a new sensor entity.
   *
   * @param id The entity identifier. Must be unique inside the integration driver.
   * @param name The human-readable name of the entity.
   * @param params Entity parameters.
   * @throws AssertionError if invalid parameters are specified.
   */
  constructor(
    id: string,
    name: string | Map<string, string> | Record<string, string>,
    { attributes, deviceClass, options, area }: SensorParams = {}
  ) {
    super(id, name, ENTITYTYPES.SENSOR, { attributes, deviceClass, options, area });

    log.debug(`Sensor entity created with id: ${this.id}`);
  }
}

export default Sensor;
export { STATES, FEATURES, ATTRIBUTES, COMMANDS, DEVICECLASSES, OPTIONS };
