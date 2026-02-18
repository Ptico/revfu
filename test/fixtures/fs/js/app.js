// Level 3: Main app with mixed imports
import { User } from './models/user.js';
import { slugify } from "js/lib/utils";

const user = new User('john doe');
const slug = slugify(user.name);

console.log(`App started: ${slug}`);

// Reference to CSS
const styles = '/css/main.css';
