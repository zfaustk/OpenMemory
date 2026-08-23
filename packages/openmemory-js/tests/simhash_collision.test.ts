process.env.OM_EMBEDDINGS = "synthetic";
process.env.OM_EMBEDDING_FALLBACK = "synthetic";
process.env.OM_METADATA_BACKEND = process.env.OM_METADATA_BACKEND || "sqlite";
process.env.OM_VECTOR_BACKEND = process.env.OM_VECTOR_BACKEND || "sqlite";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Memory } from "../src/core/memory";
import {
    compute_simhash,
    is_duplicate_content,
} from "../src/memory/hsg";
import { run_async } from "../src/core/db";

const A = "The expense report was moved to Thursday.";
const B = "The holiday calendar was approved this morning.";

describe("simhash collision dedup", () => {
    const uid = "simhash_collision_tester_v1";
    const mem = new Memory(uid);

    beforeAll(async () => {
        await run_async("DELETE FROM memories WHERE user_id = ?", [uid]);
    });

    afterAll(async () => {
        await run_async("DELETE FROM memories WHERE user_id = ?", [uid]);
    });

    it("the reported sentences share a simhash", () => {
        expect(compute_simhash(A)).toBe(compute_simhash(B));
        expect(compute_simhash(A)).toBe("1e1380001e138000");
    });

    it("does not treat distinct content as a duplicate", () => {
        expect(is_duplicate_content(A, B)).toBe(false);
        expect(is_duplicate_content(A, A)).toBe(true);
        expect(is_duplicate_content(A, ` ${A} `)).toBe(true);
    });

    it("stores both colliding but unrelated sentences", async () => {
        const first = await mem.add(A, { user_id: uid });
        const second = await mem.add(B, { user_id: uid });
        expect(first.deduplicated).toBeFalsy();
        expect(second.deduplicated).toBeFalsy();
        expect(second.id).not.toBe(first.id);

        const again = await mem.add(A, { user_id: uid });
        expect(again.deduplicated).toBe(true);
        expect(again.id).toBe(first.id);
    });
});
