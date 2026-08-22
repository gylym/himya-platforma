import assert from "node:assert/strict";
import { DEFAULT_CONTENT } from "../data.js";

assert.equal(new Set(DEFAULT_CONTENT.map((item) => item.path)).size, DEFAULT_CONTENT.length);
assert.equal(DEFAULT_CONTENT.filter((item) => item.parent_id === "school-theory").length, 5);
assert.equal(DEFAULT_CONTENT.filter((item) => item.parent_id === "university-root").length, 4);
assert.equal(DEFAULT_CONTENT.filter((item) => item.parent_id === "bridge-root").length, 5);

console.log("Контент құрылымы сәтті тексерілді");
