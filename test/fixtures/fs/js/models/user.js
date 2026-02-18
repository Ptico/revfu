// Level 2: User model with extensionless import
import { capitalize } from '../lib/utils';
import { APP_VERSION } from '../lib/constants';

export class User {
  constructor(name) {
    this.name = capitalize(name);
    this.version = APP_VERSION;
  }

  toString() {
    return `User: ${this.name}`;
  }
}
