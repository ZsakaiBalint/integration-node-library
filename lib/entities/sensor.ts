/**
 * Sensor-entity definitions.
 * See <https://github.com/unfoldedcircle/core-api/tree/main/doc/entities> for more information.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

import { Entity, EntityType } from "./entity.js";
import log from "../loggers.js";

/**
 * Sensor entity states.
 */
export enum States {
  Unavailable = "UNAVAILABLE",
  Unknown = "UNKNOWN",
  On = "ON"
}

/**
 * Sensor entity features.
 */
export enum Features {}

/**
 * Sensor entity attributes.
 */
export enum Attributes {
  State = "state",
  Value = "value",
  Unit = "unit"
}

/**
 * Sensor entity commands.
 */
export enum Commands {}

/**
 * Sensor entity device classes.
 */
export enum DeviceClasses {
  Custom = "custom",
  Battery = "battery",
  Current = "current",
  Energy = "energy",
  Humidity = "humidity",
  Power = "power",
  Temperature = "temperature",
  Voltage = "voltage"
}

/**
 * Sensor entity options.
 */
export enum Options {
  CustomUnit = "custom_unit",
  NativeUnit = "native_unit",
  Decimals = "decimals",
  MinValue = "min_value",
  MaxValue = "max_value"
}

interface SensorParams {
  attributes?: { [key: string]: string | number | boolean };
  deviceClass?: DeviceClasses;
  options?: { [key: string]: string | number | boolean | object };
  area?: string;
}

export class Sensor extends Entity {
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
    name: string | { [key: string]: string }, 
    { attributes, deviceClass, options, area }: SensorParams = {}
  ) {
    super(id, name, EntityType.Sensor, { attributes, deviceClass, options, area });

    log.debug(`Sensor entity created with id: ${this.id}`);
  }
}
