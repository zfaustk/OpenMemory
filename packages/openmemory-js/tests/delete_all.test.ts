process.env.OM_EMBEDDINGS = "synthetic";
process.env.OM_EMBEDDING_FALLBACK = "synthetic";
process.env.OM_METADATA_BACKEND = process.env.OM_METADATA_BACKEND || "sqlite";
process.env.OM_VECTOR_BACKEND = process.env.OM_VECTOR_BACKEND || "sqlite";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Memory } from "../src/core/memory";
import { delete_memory } from "../src/memory/hsg";
import { all_async, run_async } from "../src/core/db";

describe("delete_all", () => {
    const uid = "js_delete_all_tester_v1";
    const other = "js_delete_all_other_v1";
    const mem = new Memory(uid);

    async function cleanup() {
        await run_async("DELETE FROM memories WHERE user_id IN (?, ?)", [
            uid,
            other,
        ]);
    }

    beforeAll(cleanup);
    afterAll(cleanup);

    it("removes rows and does not serve deleted memories from the query cache", async () => {
        await mem.add("The capital of France is Paris.", { user_id: uid });
        await mem.add("Water boils at 100 degrees Celsius.", { user_id: uid });
        await mem.add("Keep this other user's fact.", { user_id: other });

        const before = await mem.search("capital of France", {
            user_id: uid,
            limit: 5,
        });
        expect(before.length).toBeGreaterThan(0);

        const result = await mem.delete_all(uid);
        expect(result.deleted).toBe(2);

        const after = await mem.search("capital of France", {
            user_id: uid,
            limit: 5,
        });
        expect(after).toEqual([]);

        const rows = await all_async(
            "SELECT user_id FROM memories WHERE user_id IN (?, ?)",
            [uid, other],
        );
        expect(rows.map((r: any) => r.user_id)).toEqual([other]);
    });

    it("delete_memory drops cached hits for that user", async () => {
        const text = "Mercury is the closest planet to the Sun.";
        const added = await mem.add(text, { user_id: uid });
        const before = await mem.search("closest planet to the Sun", {
            user_id: uid,
            limit: 5,
        });
        expect(before.some((r: any) => r.id === added.id)).toBe(true);

        await delete_memory(added.id);

        const after = await mem.search("closest planet to the Sun", {
            user_id: uid,
            limit: 5,
        });
        expect(after.every((r: any) => r.id !== added.id)).toBe(true);
    });
});
