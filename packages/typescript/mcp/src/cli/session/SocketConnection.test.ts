import net from "node:net";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";
import { safePathJoin } from "@alumnium/core/internal";
import { pushTeardown } from "../../../../alumnium/tests/unit/mocks.ts";
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

  it("delivers only messages before a malformed line, then closes", async () => {
    const { client, remote } = await connectPair();
    const connection = new SocketConnection(client);
    const messages = collect(connection);
    const onclose = vi.fn();
    connection.onclose = onclose;

    remote.write('{"a":1}\nnope\n{"a":2}\n');

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(messages).toEqual([{ a: 1 }]);
  });

  it("skips blank lines between messages", async () => {
    const { client, remote } = await connectPair();
    const messages = collect(new SocketConnection(client));

    remote.write('{"a":1}\n\n\n{"a":2}\n');

    await vi.waitFor(() => expect(messages).toEqual([{ a: 1 }, { a: 2 }]));
  });

  it("closes the connection on malformed input", async () => {
    const { client, remote } = await connectPair();
    const connection = new SocketConnection(client);
    const onclose = vi.fn();
    connection.onclose = onclose;
    const onerror = vi.fn();
    connection.onerror = onerror;

    remote.write("nope\n");

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(onerror).toHaveBeenCalledOnce();
    expect(onerror).toHaveBeenCalledWith("malformed", expect.any(SyntaxError));
  });

  it("closes the connection when a handler throws and drops later messages", async () => {
    const { client, remote } = await connectPair();
    const connection = new SocketConnection(client);
    const onmessage = vi.fn(() => {
      throw new Error("boom");
    });
    connection.onmessage = onmessage;
    const onclose = vi.fn();
    connection.onclose = onclose;

    const onerror = vi.fn();
    connection.onerror = onerror;
    const peerEnded = new Promise<void>((resolve) => remote.on("end", resolve));

    remote.write('{"a":1}\n{"a":2}\n');

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
    await peerEnded;
    expect(onerror).toHaveBeenCalledOnce();
    expect(onerror).toHaveBeenCalledWith("handler", expect.any(Error));
    expect(onmessage).toHaveBeenCalledTimes(1);
  });

  it("stops delivering messages in a chunk after close()", async () => {
    const { client, remote } = await connectPair();
    const connection = new SocketConnection(client);
    const onmessage = vi.fn(() => connection.close());
    connection.onmessage = onmessage;
    const onclose = vi.fn();
    connection.onclose = onclose;

    remote.write('{"a":1}\n{"a":2}\n');

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(onmessage).toHaveBeenCalledTimes(1);
  });

  it("closes when an unterminated line exceeds the limit across small chunks", async () => {
    const { client, remote } = await connectPair();
    const connection = new SocketConnection(client, 1024);
    const onclose = vi.fn();
    connection.onclose = onclose;

    remote.on("error", () => {});
    for (let i = 0; i < 20; i++) {
      remote.write("x".repeat(100));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
  });

  it("closes the connection when a line exceeds the limit", async () => {
    const { client, remote } = await connectPair();
    const connection = new SocketConnection(client, 1024);
    const onclose = vi.fn();
    connection.onclose = onclose;

    remote.write("x".repeat(2048));

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
  });

  it("delivers a line over a small limit only when the limit is Infinity", async () => {
    const line = JSON.stringify({ text: "x".repeat(4096) });

    // NOTE: The limit applies to the unterminated part of the buffer.
    const limited = await connectPair();
    const limitedConnection = new SocketConnection(limited.client, 1024);
    const limitedMessages = collect(limitedConnection);
    const onclose = vi.fn();
    limitedConnection.onclose = onclose;
    limited.remote.on("error", () => {});
    limited.remote.write(line);
    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
    limited.remote.write("\n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(limitedMessages).toEqual([]);

    const unlimited = await connectPair();
    const unlimitedMessages = collect(
      new SocketConnection(unlimited.client, Infinity),
    );
    unlimited.remote.write(line);
    await new Promise((resolve) => setTimeout(resolve, 20));
    unlimited.remote.write("\n");
    await vi.waitFor(() =>
      expect(unlimitedMessages).toEqual([JSON.parse(line)]),
    );
  });

  it("reads a long line in many chunks in linear time", async () => {
    const { client, remote } = await connectPair();
    const messages = collect(new SocketConnection(client, Infinity));
    const text = "x".repeat(24 * 1024 * 1024);
    const line = Buffer.from(`${JSON.stringify({ text })}\n`);

    const startedAt = Date.now();
    remote.write(line);

    await vi.waitFor(() => expect(messages).toHaveLength(1), {
      timeout: 15_000,
    });
    // NOTE: Quadratic reads take ~7 s here, linear ones well under a second.
    expect(Date.now() - startedAt).toBeLessThan(3_000);
  }, 20_000);

  it("delivers a message within the line limit", async () => {
    const { client, remote } = await connectPair();
    const messages = collect(new SocketConnection(client, 1024));
    const text = "x".repeat(1000 - '{"text":""}'.length);

    remote.write(`${JSON.stringify({ text })}\n`);

    await vi.waitFor(() => expect(messages).toEqual([{ text }]));
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
