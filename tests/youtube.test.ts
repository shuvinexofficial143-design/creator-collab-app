import test from "node:test";
import assert from "node:assert/strict";
import { youtubeEmbedUrl } from "../src/lib/youtube";

test("YouTube references become privacy-enhanced embeds", () => {
  for (const src of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=1",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ]) assert.equal(youtubeEmbedUrl(src), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

test("untrusted URLs cannot become video embeds", () => {
  for (const src of ["https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "http://youtu.be/dQw4w9WgXcQ", "https://example.com/", "https://www.youtube.com/watch?v=bad", ""])
    assert.equal(youtubeEmbedUrl(src), null);
});
