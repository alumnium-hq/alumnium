import net from "node:net";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";
import { pushTeardown } from "../../../tests/unit/mocks.ts";
import { safePathJoin } from "../../utils/fs.ts";
import { SocketConnection } from "./SocketConnection.ts";

let nextId = 1;

describe("SocketConnection", () => {
  it("joins a message split across chunks", async () => {
    const { client, remote } = await connectPair();
    const messages = collect(new SocketConnection(client));

    remote.write('{"a":');
    await new Promise((resolve) => setTimeout(resolve, 20));
    remote.write("1}\n");

    await vi.waitFor(() => expect(messages).toEqual([{ a: 1 }]));
  });

  it("splits multiple messages in one chunk", async () => {
    const { client, remote } = await connectPair();
    const messages = collect(new SocketConnection(client));

    remote.write('{"a":1}\n{"a":2}\n');

    await vi.waitFor(() => expect(messages).toEqual([{ a: 1 }, { a: 2 }]));
  });

  it("keeps multibyte characters split across chunks", async () => {
    const { client, remote } = await connectPair();
    const messages = collect(new SocketConnection(client));

    const bytes = Buffer.from('{"a":"é"}\n');
    remote.write(bytes.subarray(0, 7));
    await new Promise((resolve) => setTimeout(resolve, 20));
    remote.write(bytes.subarray(7));

    await vi.waitFor(() => expect(messages).toEqual([{ a: "é" }]));
  });

  it("round-trips large messages", async () => {
    const { client, remote } = await connectPair();
    const sender = new SocketConnection(client);
    const messages = collect(new SocketConnection(remote));
    const text = "x".repeat(2 * 1024 * 1024);

    await sender.send({ text });

    await vi.waitFor(() => expect(messages).toEqual([{ text }]));
  });

  it("closes the connection on malformed input", async () => {
    const { client, remote } = await connectPair();
    const connection = new SocketConnection(client);
    const onclose = vi.fn();
    connection.onclose = onclose;

    remote.write("nope\n");

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
  });
});

async function connectPair() {
  const socketPath = safePathJoin(
    os.tmpdir(),
    `alumnium-sc-${process.pid}-${nextId++}.sock`,
  );
  const remoteSocket = Promise.withResolvers<net.Socket>();
  const server = net.createServer((socket) => remoteSocket.resolve(socket));
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  const client = net.createConnection(socketPath);
  const remote = await remoteSocket.promise;
  pushTeardown(() => {
    client.destroy();
    remote.destroy();
    server.close();
  });
  return { client, remote };
}

function collect(connection: SocketConnection): unknown[] {
  const messages: unknown[] = [];
  connection.onmessage = (message) => messages.push(message);
  return messages;
}
