# Arena assets — where every file came from

Every asset in the repo gets a line here: source, licence, what we changed. No exceptions
(arena-design.md §5).

| File | Source | Licence | Changes |
|---|---|---|---|
| `frontend/public/models/arena/hunter.glb` | **KayKit Character Pack: Adventurers 1.0** by Kay Lousberg — `Rogue_Hooded.glb`, from github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (also kaylousberg.itch.io/kaykit-adventurers) | **CC0 1.0** (public domain; credit optional: "Kay Lousberg, www.kaylousberg.com") | Kept 27 of 76 animation clips, redundant keyframes removed (glTF-Transform `resample`, `dedup`, `prune`): 3.5 MB → 2.5 MB (1.07 MB gzipped). Weapons hidden at runtime. Re-coloured at runtime in `figure.js` (toon shading, cyan outline) |

## Clips kept in `hunter.glb`

Movement: `Unarmed_Idle`, `Idle`, `Walking_A`, `Running_A`, `Running_B`, `Jump_Start`, `Jump_Idle`,
`Jump_Land`, `Dodge_Forward/Backward/Left/Right`.
Fighting (for the fighter kit): `Unarmed_Melee_Attack_Punch_A/B`, `Unarmed_Melee_Attack_Kick`,
`1H_Melee_Attack_Slice_Diagonal`, `1H_Melee_Attack_Stab`, `Block`, `Blocking`, `Block_Hit`,
`Hit_A`, `Hit_B`, `Death_A`, `Death_A_Pose`, `Spellcast_Raise`, `Spellcast_Shoot`, `Cheer`.

To get a dropped clip back: re-run the strip script with it added to the keep list. The script
is short — glTF-Transform's `NodeIO`, dispose every animation not in the list, then
`resample(), dedup(), prune()`.

## Why this pack, and what else is out there

It is a placeholder that is good enough to play with, not the final hunter. Chosen because it is
CC0, downloadable without a login (it is on GitHub), ships glTF that three.js loads directly, and
its 76 animations already cover block, dodge, punches, kick, spellcast, hit and death — the whole
fighter kit.

The alternatives, for when we want something more anime:

- **Quaternius — Universal Animation Library 1 & 2 + Universal Base Characters** (CC0). Realistic
  proportions; library 2 has 3- and 4-hit combos split per hit. Hosted on quaternius.com / itch.io,
  which the Claude container cannot reach: download it yourself and drop the .glb in the repo.
- **Mixamo** (free with an Adobe login, royalty-free). Huge library, any humanoid. Login needed.
- **Our own code-built neon fighter**, as the original plan said. Most work, most "ours".
