import subprocess

cmds = [
    "python scripts/fetch_history.py",
    "python scripts/compute_pos52_bucket_stats.py",
    "python scripts/compute_event_avg_move.py"
]

for c in cmds:
    subprocess.run(c, shell=True, check=True)

print("✅ ALL DATA BUILT")
