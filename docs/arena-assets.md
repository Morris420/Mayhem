# Arena assets — where every file came from

Every asset in the repo gets a line here: source, licence, what we changed. No exceptions
(arena-design.md §5).

| File | Source | Licence | Changes |
|---|---|---|---|
| `frontend/public/models/arena/hunter.glb` | **Morrison's own hunter**: made in VRoid Studio, rigged and animated on Mixamo (Adobe), 14 FBX downloads (25 Nov) | Character: ours. Animations: Mixamo, royalty-free for use in games; the raw Mixamo FBX files may not be redistributed, so they stay **out of the repo** | Converted offline (scratch folder, not the repo): three.js `FBXLoader` → `GLTFExporter` in headless Chromium, every clip cut to the part we use and made in-place, stray Blender "Cube" removed, materials replaced by plain named ones (the FBX had no textures). The textures were then put back from Morrison's `MayhemBase.vrm` (matched by material name, resized to ≤1024 px, WebP), then glTF-Transform `resample / dedup (no materials) / prune / weld / quantize`. 16 clips, 2.3 MB (≈1.26 MB gzipped). Toon-shaded at runtime in `figure.js`, no outline; the dummy is the same hunter tinted crimson with red eyes |
| `frontend/public/models/arena/dungeon-kit.glb` | **KayKit Dungeon Remastered** by Kay Lousberg, github.com/KayKit-Game-Assets (also kaylousberg.itch.io) | **CC0 1.0** (credit optional: "Kay Lousberg, www.kaylousberg.com") | 15 pieces merged into one file (one node per piece): floor_tile_large, floor_tile_large_rocks, wall, wall_arched, wall_cracked, wall_corner, pillar, pillar_decorated, torch_mounted, banner_patternA_blue, banner_thin_blue, rubble_large, rubble_half, barrel_large, crates_stacked. 353 KB. Placed by `rooms/training-hall.js` (`dress()`), drawn as instanced meshes |

## Clips in `hunter.glb`

| Clip | From (Mixamo) | Used for |
|---|---|---|
| `Idle` | Breathing Idle (0–4.5 s) | standing alone |
| `FightIdle` | Bouncing Fight Idle | standing with someone within 6 m, guarding |
| `Walk`, `Run` | Walking, Running | locomotion, blended by speed (stride 1.75 / 4.6 m/s) |
| `Jump`, `JumpStanding` | Running Jump, Standing Jump | jumps, double-jump tumble |
| `FallLand` | Falling To Landing | falling, landing |
| `Roll` | Stand To Roll | the dash |
| `HitHead`, `HitBody` | Big Hit To Head, Stomach Hit | hitstun, knockdown |
| `Jab`, `Straight`, `Uppercut`, `Cross`, `BodyBlow` | cut from one Uppercut Jab flurry | light combo (jab → straight → uppercut), heavy, launcher |
| `Emote` | Swing Dancing (0–6 s) | T |

Not there yet (wanted): a better roll, Knocked Down, Getting Up, Dying, Center Block, a kick or
hook, a spellcast. The `.vrm` itself stays out of the repo (it is only the texture source).

## How to add a clip

1. Download from Mixamo as *FBX Binary, Without Skin, 30 fps* (In Place if offered).
2. Add it to the converter's `PLAN` (name, file, start, end seconds) and rebuild; then run the
   optimiser. Both scripts live outside the repo (they read Mixamo files).
3. Map it in `figure.js` (`CLIPS`, `MOVE_CLIPS`, `IMPACT` for attacks: the fraction of the clip
   where the fist lands).

## Arena presets

Any glTF/GLB kit or scene works if it is CC0 or CC-BY (credit here), ideally under 10–15 MB.
Collisions are **not** taken from the model: the room file (`src/arena/rooms/*.js`) lists the
boxes you can stand on and bump into, and `dress()` places the pieces. That keeps the physics
deterministic and cheap.
