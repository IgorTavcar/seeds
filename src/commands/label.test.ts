import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir: string;

const CLI = join(import.meta.dir, "../../src/index.ts");

async function run(
	args: string[],
	cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["bun", "run", CLI, ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

async function runJson<T = unknown>(args: string[], cwd: string): Promise<T> {
	const { stdout } = await run([...args, "--json"], cwd);
	return JSON.parse(stdout) as T;
}

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "seeds-label-test-"));
	await run(["init"], tmpDir);
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

describe("sd label add", () => {
	test("adds a label to an issue", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue"],
			tmpDir,
		);
		const result = await runJson<{ success: boolean; command: string; label: string }>(
			["label", "add", create.id, "bug"],
			tmpDir,
		);
		expect(result.success).toBe(true);
		expect(result.label).toBe("bug");

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["bug"]);
	});

	test("adds a label to multiple issues", async () => {
		const c1 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 1"],
			tmpDir,
		);
		const c2 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 2"],
			tmpDir,
		);
		const result = await runJson<{ success: boolean; issueIds: string[]; label: string }>(
			["label", "add", c1.id, c2.id, "urgent"],
			tmpDir,
		);
		expect(result.success).toBe(true);
		expect(result.issueIds).toEqual([c1.id, c2.id]);

		const s1 = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", c1.id],
			tmpDir,
		);
		const s2 = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", c2.id],
			tmpDir,
		);
		expect(s1.issue.labels).toEqual(["urgent"]);
		expect(s2.issue.labels).toEqual(["urgent"]);
	});

	test("deduplicates labels", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue"],
			tmpDir,
		);
		await run(["label", "add", create.id, "bug"], tmpDir);
		await run(["label", "add", create.id, "bug"], tmpDir);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["bug"]);
	});

	test("fails for unknown issue", async () => {
		const { exitCode } = await run(["label", "add", "proj-ffff", "bug"], tmpDir);
		expect(exitCode).not.toBe(0);
	});

	test("requires at least two positional args", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test"],
			tmpDir,
		);
		const { exitCode } = await run(["label", "add", create.id], tmpDir);
		expect(exitCode).not.toBe(0);
	});
});

describe("sd label remove", () => {
	test("removes a label from an issue", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue"],
			tmpDir,
		);
		await run(["label", "add", create.id, "bug"], tmpDir);
		await run(["label", "add", create.id, "urgent"], tmpDir);

		await run(["label", "remove", create.id, "bug"], tmpDir);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["urgent"]);
	});

	test("cleans up empty labels to undefined", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue"],
			tmpDir,
		);
		await run(["label", "add", create.id, "bug"], tmpDir);
		await run(["label", "remove", create.id, "bug"], tmpDir);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toBeUndefined();
	});

	test("removes label from multiple issues", async () => {
		const c1 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 1"],
			tmpDir,
		);
		const c2 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 2"],
			tmpDir,
		);
		await run(["label", "add", c1.id, c2.id, "bug"], tmpDir);
		await run(["label", "remove", c1.id, c2.id, "bug"], tmpDir);

		const s1 = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", c1.id],
			tmpDir,
		);
		const s2 = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", c2.id],
			tmpDir,
		);
		expect(s1.issue.labels).toBeUndefined();
		expect(s2.issue.labels).toBeUndefined();
	});

	test("removing a non-existent label succeeds silently", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue", "--labels", "bug,urgent"],
			tmpDir,
		);
		const { exitCode } = await run(["label", "remove", create.id, "nonexistent"], tmpDir);
		expect(exitCode).toBe(0);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["bug", "urgent"]);
	});
});

describe("sd label list", () => {
	test("lists labels on an issue", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue"],
			tmpDir,
		);
		await run(["label", "add", create.id, "bug"], tmpDir);
		await run(["label", "add", create.id, "urgent"], tmpDir);

		const result = await runJson<{ success: boolean; labels: string[] }>(
			["label", "list", create.id],
			tmpDir,
		);
		expect(result.success).toBe(true);
		expect(result.labels).toEqual(["bug", "urgent"]);
	});

	test("returns empty array for issue with no labels", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue"],
			tmpDir,
		);
		const result = await runJson<{ success: boolean; labels: string[] }>(
			["label", "list", create.id],
			tmpDir,
		);
		expect(result.labels).toEqual([]);
	});

	test("fails for unknown issue", async () => {
		const { exitCode } = await run(["label", "list", "proj-ffff"], tmpDir);
		expect(exitCode).not.toBe(0);
	});
});

describe("sd label list-all", () => {
	test("lists all labels across issues with counts", async () => {
		const c1 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 1"],
			tmpDir,
		);
		const c2 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 2"],
			tmpDir,
		);
		await run(["label", "add", c1.id, "bug"], tmpDir);
		await run(["label", "add", c1.id, "urgent"], tmpDir);
		await run(["label", "add", c2.id, "bug"], tmpDir);

		const result = await runJson<{
			success: boolean;
			labels: Array<{ label: string; count: number }>;
		}>(["label", "list-all"], tmpDir);
		expect(result.success).toBe(true);
		expect(result.labels).toHaveLength(2);
		// Sorted by count desc: bug=2, urgent=1
		expect(result.labels[0]).toEqual({ label: "bug", count: 2 });
		expect(result.labels[1]).toEqual({ label: "urgent", count: 1 });
	});

	test("includes labels from closed issues", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test issue"],
			tmpDir,
		);
		await run(["label", "add", create.id, "archived"], tmpDir);
		await run(["close", create.id], tmpDir);

		const result = await runJson<{
			success: boolean;
			labels: Array<{ label: string; count: number }>;
		}>(["label", "list-all"], tmpDir);
		expect(result.labels).toHaveLength(1);
		expect(result.labels[0]).toEqual({ label: "archived", count: 1 });
	});

	test("returns empty list when no labels exist", async () => {
		await run(["create", "--title", "No labels"], tmpDir);
		const result = await runJson<{
			success: boolean;
			labels: Array<{ label: string; count: number }>;
		}>(["label", "list-all"], tmpDir);
		expect(result.labels).toEqual([]);
	});
});

describe("sd create --labels", () => {
	test("creates issue with labels from comma-separated flag", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Labeled issue", "--labels", "bug,urgent"],
			tmpDir,
		);
		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["bug", "urgent"]);
	});

	test("trims whitespace in comma-separated labels", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Labeled issue", "--labels", " bug , urgent "],
			tmpDir,
		);
		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["bug", "urgent"]);
	});

	test("omits labels when not provided", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "No labels"],
			tmpDir,
		);
		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toBeUndefined();
	});
});

describe("sd update label flags", () => {
	test("--add-label adds a label", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test"],
			tmpDir,
		);
		await run(["update", create.id, "--add-label", "bug"], tmpDir);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["bug"]);
	});

	test("--remove-label removes a label", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test", "--labels", "bug,urgent"],
			tmpDir,
		);
		await run(["update", create.id, "--remove-label", "bug"], tmpDir);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["urgent"]);
	});

	test("--set-labels replaces all labels", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test", "--labels", "bug,urgent"],
			tmpDir,
		);
		await run(["update", create.id, "--set-labels", "feature,v2"], tmpDir);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toEqual(["feature", "v2"]);
	});

	test("--set-labels with empty string clears labels", async () => {
		const create = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Test", "--labels", "bug,urgent"],
			tmpDir,
		);
		await run(["update", create.id, "--set-labels", ""], tmpDir);

		const show = await runJson<{ success: boolean; issue: { labels?: string[] } }>(
			["show", create.id],
			tmpDir,
		);
		expect(show.issue.labels).toBeUndefined();
	});
});

describe("sd list label filters", () => {
	test("--label filters with AND logic", async () => {
		const c1 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 1", "--labels", "bug,urgent"],
			tmpDir,
		);
		const _c2 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 2", "--labels", "bug"],
			tmpDir,
		);

		const result = await runJson<{
			success: boolean;
			issues: Array<{ id: string }>;
			count: number;
		}>(["list", "--label", "bug,urgent"], tmpDir);
		expect(result.count).toBe(1);
		expect(result.issues[0]?.id).toBe(c1.id);
	});

	test("--label-any filters with OR logic", async () => {
		const c1 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 1", "--labels", "bug"],
			tmpDir,
		);
		const c2 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 2", "--labels", "feature"],
			tmpDir,
		);
		const c3 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Issue 3"],
			tmpDir,
		);

		const result = await runJson<{
			success: boolean;
			issues: Array<{ id: string }>;
			count: number;
		}>(["list", "--label-any", "bug,feature"], tmpDir);
		expect(result.count).toBe(2);
		const ids = result.issues.map((i) => i.id);
		expect(ids).toContain(c1.id);
		expect(ids).toContain(c2.id);
		expect(ids).not.toContain(c3.id);
	});

	test("--unlabeled shows only unlabeled issues", async () => {
		const _c1 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Labeled", "--labels", "bug"],
			tmpDir,
		);
		const c2 = await runJson<{ success: boolean; id: string }>(
			["create", "--title", "Unlabeled"],
			tmpDir,
		);

		const result = await runJson<{
			success: boolean;
			issues: Array<{ id: string }>;
			count: number;
		}>(["list", "--unlabeled"], tmpDir);
		expect(result.count).toBe(1);
		expect(result.issues[0]?.id).toBe(c2.id);
	});
});
