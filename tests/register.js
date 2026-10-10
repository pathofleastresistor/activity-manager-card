// Registers the module loader so the card's unpkg Lit imports resolve to the local
// devDependency. Only used by `npm test`; the shipped card is untouched.
import { register } from "node:module";

register("./loader.js", import.meta.url);
