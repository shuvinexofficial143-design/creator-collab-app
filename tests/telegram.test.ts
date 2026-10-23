import test from "node:test";
import assert from "node:assert/strict";
import { telegramDeliveryMode, telegramCaption } from "../src/lib/telegram";

test("small supported media can be forwarded; large media receive a private link", () => {
  assert.equal(telegramDeliveryMode(1024, "video/mp4"), "file");
  assert.equal(telegramDeliveryMode(1024, "audio/mpeg"), "file");
  assert.equal(telegramDeliveryMode(16 * 1024 * 1024, "video/mp4"), "link");
  assert.equal(telegramDeliveryMode(null, "video/mp4"), "link");
  assert.equal(telegramDeliveryMode(0, "video/mp4"), "link");
  assert.equal(telegramDeliveryMode(1024, "text/html"), "link");
});

test("Telegram captions strip control characters", () => {
  const result = telegramCaption("Hi\nthere\rtest", "VOICE");
  assert.ok(result.includes("Hi there test"));
  assert.ok(result.includes("Voice over"));
});
