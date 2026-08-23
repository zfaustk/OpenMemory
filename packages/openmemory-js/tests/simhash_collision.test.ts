process.env.OM_EMBEDDINGS = "synthetic";
process.env.OM_EMBEDDING_FALLBACK = "synthetic";
process.env.OM_METADATA_BACKEND = process.env.OM_METADATA_BACKEND || "sqlite";
process.env.OM_VECTOR_BACKEND = process.env.OM_VECTOR_BACKEND || "sqlite";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Memory } from "../src/core/memory";
import {
    compute_simhash,
    extract_essence,
    is_duplicate_content,
} from "../src/memory/hsg";
import { env } from "../src/core/cfg";
import { all_async, run_async } from "../src/core/db";

const A = "The expense report was moved to Thursday.";
const B = "The holiday calendar was approved this morning.";
const LONG =
    "Yesterday I went to the park at 4:00 PM and saw a dog. " +
    "The capital of France is Paris. ".repeat(12);

describe("simhash collision dedup", () => {
    const uid = "simhash_collision_tester_v1";
    const other = "simhash_collision_other_v1";
    const mem = new Memory(uid);

    async function cleanup() {
        await run_async("DELETE FROM memories WHERE user_id IN (?, ?)", [
            uid,
            other,
        ]);
    }

    beforeAll(cleanup);
    afterAll(cleanup);

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

    it("does not treat another user's identical content as a duplicate", async () => {
        const first = await mem.add(A, { user_id: uid });
        const otherMem = new Memory(other);
        const second = await otherMem.add(A, { user_id: other });
        expect(second.deduplicated).toBeFalsy();
        expect(second.id).not.toBe(first.id);
    });

    it("still dedups a long memory after it is stored as a summary", async () => {
        expect(LONG.length).toBeGreaterThan(env.summary_max_length);
        const stored = extract_essence(
            LONG,
            "semantic",
            env.summary_max_length,
        );
        expect(stored).not.toBe(LONG);

        const first = await mem.add(LONG, { user_id: uid });
        expect(first.deduplicated).toBeFalsy();
        const again = await mem.add(LONG, { user_id: uid });
        expect(again.deduplicated).toBe(true);
        expect(again.id).toBe(first.id);

        const rows = await all_async(
            "SELECT id FROM memories WHERE user_id = ? AND simhash = ?",
            [uid, compute_simhash(LONG)],
        );
        expect(rows).toHaveLength(1);
    });
});
