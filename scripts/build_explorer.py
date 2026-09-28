"""Build static/js/explorer-data.js from the public anvo25/deep-bias dataset.

Usage:
  python3 scripts/build_explorer.py <dir> static/js/explorer-data.js

<dir> must hold these files from https://huggingface.co/datasets/anvo25/deep-bias:
  olmo3_7b_sft.jsonl             (outputs/olmo3_7b_sft.jsonl)
  framings.jsonl                 (framings/train.jsonl)
  raw_olmo_framed.jsonl.gz       (raw/olmo3_7b_sft/framed.jsonl.gz)

Prompts were hand-picked so that the Olmo-3-7B-SFT answers shown are real
members of the asked category, the bars agree exactly with DR and FR, and each
prompt clearly shows a Deep or a Shallow bias.
"""
import gzip
import json
import sys

HF, OUT = sys.argv[1], sys.argv[2]
MODEL = "olmo3_7b_sft"

# Deep bias: the top answer survives reframing.
DEEP = [
    "1847229",  # popular butterfly (paper Fig. 1a)
    "1693670",  # Disney movie (paper Fig. 5)
    "972328",   # popular big cat (paper Tab. 1)
    "1191170",  # Nas album
    "1262954",  # historical trade network
    "1648409",  # Quebec food
    "1656246",  # Barcelona attraction
    "1872081",  # Egyptian dish
    "1954532",  # email provider
    "1153365",  # balloon color
]
# Shallow bias: the top answer does not survive reframing.
SHALLOW = [
    "1656071",  # 1930s cartoon character
    "1808643",  # Athens food
    "1907334",  # astronaut role
    "988356",   # cryptocurrency
    "1653114",  # superhero character
    "613562",   # musical instrument
    "1198526",  # famous person
]
# Framing quoted in the paper, shown for the butterfly example.
PREFERRED_FRAMING = {"1847229": "birthday invitation"}

MAX_BARS = 4     # named bars per panel; the rest are pooled
MIN_COUNT = 2    # answers given only once are pooled into "others"
N = 30

ids = DEEP + SHALLOW
rows = {}
for line in open(f"{HF}/{MODEL}.jsonl"):
    r = json.loads(line)
    if r["id"] in ids:
        rows[r["id"]] = r

framings = {}
for line in open(f"{HF}/framings.jsonl"):
    r = json.loads(line)
    if r["id"] in ids:
        framings.setdefault(r["id"], []).append(r["framing"])


# Per-reframing responses, to list all 30 reframings with the model's answer.
responses = {}
with gzip.open(f"{HF}/raw_olmo_framed.jsonl.gz", "rt") as fh:
    for line in fh:
        r = json.loads(line)
        if r["id"] in ids:
            responses.setdefault(r["id"], []).append(r)


def all_reframings(r, named):
    """All 30 reframings in order, as [reframing text, answer shown, bar it belongs to or None].

    Answers in a named bar are shown by the bar's label; the rest (pooled as
    "others" in the bars) are shown as the model's raw response.
    """
    cluster_of = {}
    for c in r["framed"]["distribution"]:
        for form in c["surface_forms"]:
            cluster_of.setdefault(form["text"], c["answer"])
    out = []
    for x in sorted(responses[r["id"]], key=lambda x: x["framing_idx"]):
        a = cluster_of.get(x["response"], cluster_of.get(x["response"].strip()))
        assert a is not None, (r["id"], x["response"])
        if a in named:
            out.append([x["framing"], a, a])
        else:
            out.append([x["framing"], x["response"].strip(), None])
    assert len(out) == N, r["id"]
    return out


def bars(dist, keep=None):
    """Named bars for answers given at least twice, plus one pooled "others" bar."""
    shown = [d for d in dist if d["count"] >= MIN_COUNT][:MAX_BARS]
    if keep and all(d["answer"] != keep for d in shown):
        hit = [d for d in dist if d["answer"] == keep]
        if hit:
            shown = shown[:MAX_BARS - 1] + hit
    out = [[d["answer"], d["count"]] for d in shown]
    rest = N - sum(c for _, c in out)
    if rest:
        out.append([None, rest])
    return out


prompts = []
for pid in ids:
    r = rows[pid]
    top, d, f = r["direct"]["top_answer"], r["direct"]["distribution"], r["framed"]["distribution"]
    group = "deep" if pid in DEEP else "shallow"
    # Sanity checks: complete samples, bars that match DR and FR exactly, and the intended type.
    assert sum(x["count"] for x in d) == N and sum(x["count"] for x in f) == N, pid
    assert d[0]["answer"] == top and round(r["direct"]["dr"] * N) == d[0]["count"], pid
    assert round(r["framed"]["fr"] * N) == sum(x["count"] for x in f if x["answer"] == top), pid
    assert abs(r["direct"]["dr"] * r["framed"]["fr"] - r["pi"]) < 0.01, pid
    assert r["bias_type"] == group, pid

    fs = sorted((x for x in framings[pid] if len(x) <= 110), key=len)
    # Prefer a reframing that names the topic, so it reads well out of context.
    topic = r["prompt"].split()[-1].lower()
    named = [x for x in fs if topic in x.lower()] or fs
    key = PREFERRED_FRAMING.get(pid)
    framing = next((x for x in named if key and key in x.lower()), named[len(named) // 2])

    fbars = bars(f, keep=top)
    named = [a for a, _ in fbars if a is not None]
    reframings = all_reframings(r, named)
    for a, c in fbars:
        assert sum(1 for x in reframings if x[2] == a) == c, (pid, a, c)

    prompts.append({"id": pid, "prompt": r["prompt"], "group": group, "framing": framing,
                    "top": top, "dr": round(r["direct"]["dr"], 4), "fr": round(r["framed"]["fr"], 4),
                    "pi": round(r["pi"], 4), "type": r["bias_type"],
                    "d": bars(d), "f": fbars, "reframings": reframings})

data = {"source": "https://huggingface.co/datasets/anvo25/deep-bias", "model": "Olmo-3-7B-SFT",
        "prompts": prompts}
with open(OUT, "w") as fh:
    fh.write("// Generated by scripts/build_explorer.py from the anvo25/deep-bias dataset.\n")
    fh.write("window.EXPLORER_DATA = ")
    json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    fh.write(";\n")
print(len(prompts), "prompts written")
