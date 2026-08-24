#!/usr/bin/env bun

import { SlowTabServer } from "../tests/utils/SlowTabServer.ts";

const server = new SlowTabServer();
await server.start();

console.log(`Slow tab server: ${server.url}`);
console.log(`Delayed page:   ${server.slowTabUrl}`);
