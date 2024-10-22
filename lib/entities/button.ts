/**
 * Button-entity definitions.
 * See <https://github.com/unfoldedcircle/core-api/tree/main/doc/entities> for more information.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

import { CommandHandler, Types as EntityTypes, EntityName } from "./entity.js";
import { Entity } from "./entity.js";
import log from "../loggers.js";

// Button entity states
export enum States {
  Unavailable = "UNAVAILABLE",
  Available = "AVAILABLE"
}

// Button entity attributes
export enum Attributes {
  State = "state"
}

// Button commands
export enum Commands {
  Push = "push"
}

// Define types for the parameters in the constructor
interface ButtonParams {
  state?: States;
  area?: string;
  cmdHandler?: CommandHandler | null;
}

/**
 * See {@link https://github.com/unfoldedcircle/core-api/blob/main/doc/entities/entity_button.md button entity documentation}
 * for more information.
 */
export class Button extends Entity {
  /**
   * Constructs a new button entity.
   *
   * - The one-and-only `press` feature is automatically added.
   * - STATES.AVAILABLE is set if no entity-state is provided.
   *
   * @param {string} id The entity identifier. Must be unique inside the integration driver.
   * @param {EntityName} name The human-readable name of the entity.
   *        Either a string, which will be mapped to English, or a Map / Object containing multiple language strings.
   * @param {ButtonParams} [params] Entity parameters.
   * @throws AssertionError if invalid parameters are specified.
   */
  constructor(id: string, name: EntityName, { state = States.Available, area, cmdHandler }: ButtonParams = {}) {
    super(id, name, EntityTypes.Button, {
      features: ["press"],
      attributes: new Map([[Attributes.State, state as unknown as object]]),
      area,
      cmdHandler
    });

    log.debug(`Button entity created with id: ${this.id}`);
  }
}
