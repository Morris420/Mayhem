# Arena assets — where every file came from

Every asset in the repo gets a line here: source, licence, what we changed. No exceptions
(arena-design.md §5).

| File | Source | Licence | Changes |
|---|---|---|---|
| `frontend/public/models/arena/hunter.glb` | **Morrison's own hunter**: made in VRoid Studio, rigged and animated on Mixamo (Adobe), 14 FBX downloads (25 Nov) | Character: ours. Animations: Mixamo, royalty-free for use in games; the raw Mixamo FBX files may not be redistributed, so they stay **out of the repo** | Converted offline (scratch folder, not the repo): three.js `FBXLoader` → `GLTFExporter` in headless Chromium, every clip cut to the part we use and made in-place, stray Blender "Cube" removed, materials replaced by plain named ones (the FBX had no textures). The textures were then put back from Morrison's `MayhemBase.vrm` (matched by material name, resized to ≤1024 px, WebP), with the V axis flipped (three's FBX UVs are bottom-up, glTF's top-down), then glTF-Transform `resample / dedup (no materials) / prune / weld / quantize`. 16 clips, 2.3 MB (≈1.26 MB gzipped). Toon-shaded at runtime in `figure.js`, no outline; the dummy is the same hunter tinted crimson with red eyes |
| `frontend/public/models/arena/church.glb` | **"Interior view of Orthodox Church of Al-Tahira"** by **Hussein Yaseen**, https://sketchfab.com/HusseinYaseen (photogrammetry, RealityCapture) | **Creative Commons Attribution** — credit kept in `rooms/ruined-church.js` and here | 819 MB OBJ (7M triangles) + 8K texture → simplified to 300k triangles (meshoptimizer), the floor flattened inside the fight area (columns left alone), scaled to 62%, centred, 4K WebP texture, meshopt-compressed: **6.1 MB**. Unlit at runtime, tinted darker. The raw scan stays out of the repo |
| `frontend/public/textures/fx/atlas.webp` | **Free GDevelop Particles Library** by **Wishforge Games** (wishforge.itch.io/free-gdevelop-particles-library), sent by Morrison | Free to use (the author asks for nothing; credit appreciated: "Wishforge Games"). Licence text not stated on the page: recheck before a commercial release | 12 textures (glow, star, streak, ring, fire, smoke, fog, dark magic smoke, lightning, two rune circles, trail) packed into one 1024² WebP atlas, 120 KB (`scripts/atlas.mjs`, outside the repo). Used by `particles.js` |
| Open Field (code) | Generated in `src/arena/field.js` (sky, terrain, grass, flowers, trees, mountains) | Ours | — |
| Katana (code) | Built in `src/arena/katana.js` from boxes | Ours | — |
| `frontend/public/models/arena/dungeon-kit.glb` | **KayKit Dungeon Remastered** by Kay Lousberg, github.com/KayKit-Game-Assets (also kaylousberg.itch.io) | **CC0 1.0** (credit optional: "Kay Lousberg, www.kaylousberg.com") | 15 pieces merged into one file (one node per piece): floor_tile_large, floor_tile_large_rocks, wall, wall_arched, wall_cracked, wall_corner, pillar, pillar_decorated, torch_mounted, banner_patternA_blue, banner_thin_blue, rubble_large, rubble_half, barrel_large, crates_stacked. 353 KB. Placed by `rooms/training-hall.js` (`dress()`), drawn as instanced meshes |

## Clips in `hunter.glb`

| Clip | From (Mixamo) | Used for |
|---|---|---|
| `Idle` | Breathing Idle (0–4.5 s) | standing alone |
| `FightIdle` | Bouncing Fight Idle | standing with someone within 6 m, guarding |
| `Walk`, `Run` | Walking, Running | locomotion, blended by speed (stride 1.75 / 4.6 m/s) |
| `Jump`, `JumpStanding` | Jump, Standing Jump | double jump; jumps and falls |
| `FallLand` | Falling To Landing | falling, landing |
| `HitHead`, `HitBody` | Big Hit To Head, Stomach Hit | hitstun, knockdown |
| `Jab`, `Straight`, `Uppercut`, `Cross`, `BodyBlow` | cut from one Uppercut Jab flurry | light combo (jab → straight → uppercut), heavy, launcher |
| `Emote` | Swing Dancing (0–6 s) | T |
| `Roll` | Run To Rolling (root height kept) | the dash (0.42–1.85 s of it, over 0.9 s) |
| `RunJump` | Running Jump | spare |
| `CrouchIdle`, `CrouchWalk` | Crouching Idle, Crouch Walk Back (played backwards) | crouch (X) |
| `StandUp` | Crouch To Stand (backwards = crouching down) | into / out of the crouch |
| `CrouchTurn` | Crouch Turn To Stand | spare (it turns 130°) |
| `HardLanding`, `FallIdle`, `FallToRoll`, `RunToStop`, `TurnLeft`, `TurnRight`, `JumpUp` | Mixamo "Action Adventure Pack" on the same hunter (turned back to face forward; three of them needed a patched FBX loader: their footer padding broke three's) | heavy landings, long falls, stopping from a run; the rest spare |
| `SprintStart` | Standing Sprint Forward | spare |

**Not used:** the "Igris" VRM Morrison found. Its own licence metadata forbids redistribution and
modification (author "undefined", `avatarPermission: onlyAuthor`) and the rig (3ds Max `Bip001`,
texture `ShadowIgris_Body0_CO`) points to a model extracted from a commercial game. The Shadow Knight
is an original stand-in: the hunter's body in shadow, violet eyes, a katana built in code. A properly
licensed knight model swaps in through `createHunterFigure` / `engine.js`.

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
