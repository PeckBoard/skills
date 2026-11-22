---
name: smoketest-board-design
description: Design circuits, boards and multi-board systems and prove them on smoketest.cloud: KiCad/generator design, free routing with length matching and pairs, board checks, simulation, systems, AI part models and routing reviews, order packages.
version: 1.0.0
tags: [pcb, kicad, smoketest, routing, simulation, hardware]
groups: [hardware]
---

# Designing circuits, boards and systems with smoketest.cloud

Use the `smoke-test` MCP tools (prefix `mcp__smoke-test__`). Every claim that a design works must come from a job on smoketest.cloud, never from local experiments. The site checks, routes and simulates; **you** are the designer and fix what it finds at the source.

## Ground rules
- **Spending:** before any tool that takes tokens, call its quote, tell the user the number, and pass at least that as `max_tokens`:
  - `quote_chip_model` → `create_chip_model`
  - `quote_behaviour` → `create_behaviour`
  - `quote_route_review` → `start_route_review`
- **Free:** routing, board checks and simulation take no tokens. They are limited per user: routing jobs at once, starts per day, and storage.
- **Pass on the limits:** always tell the user what a report or simulation says it did NOT check or simulate, plus the evidence score's note. A clean report is not a guarantee.
- **Use plain language** for non-engineers: say what is wrong, why it matters and what changed.
- **Repeatable designs:** keep the design in a generator script or the KiCad source, not in hand edits of exported files. Fix at the source, regenerate, and send again.
- **When the site lacks something, report it as a site gap.** Don't work around it off-site.

## 1. Design the circuit (schematic)
- **Pick real parts.** Use `find_part_model` to see whether the site already has a model and how far it is trusted. Parts without a model are not simulated; the report lists them.
- **Missing model for an important chip** (regulator, eFuse, MCU, PHY): `quote_chip_model`, then `create_chip_model` with `ref`/`run_id` if known. Follow it with `get_job`.
  - If the model exists but its simulator part failed: `quote_behaviour`, then `create_behaviour`.
  - Then run `run_behaviour_examples`.
- **Before layout, check yourself:**
  - **Polarity:** diodes and TVS (one-way vs two-way symbol; cathode to the rail), electrolytic capacitors, LEDs.
  - **Enable/UVLO dividers and regulator feedback dividers:** compute Vout from the datasheet's Vref.
  - **Pull-ups** on I2C, open-drain and reset lines; **straps and boot pins**.
  - **Every IC supply pin** has decoupling next to it.
  - **Differential pairs** are named `X_P`/`X_N`. **Bus names** match the presets (`DDR_DQ0..`, `DDR_A0..`, `DDR_DQS0_P/N`, `USB_D_P/N`, `RGMII_*`, `PCIE_*`).

## 2. Lay out the board (KiCad 9)
- **Placement:** board outline, mounting holes and connectors first, then big chips with their decoupling, then the rest. Leave escape room around BGAs and QFNs. Set real courtyards.
- **Power planes and zones:** in the design for every rail. GND reference planes sit next to fast signal layers.
- **Fixed routes:** lock tracks you drew yourself, such as pre-routed pairs. The router never moves locked copper, but may move unlocked tracks (`move_tracks`, default true).
- **Design rules:** keep net classes (track width, clearance, via sizes) in the `.kicad_pro`, and length and skew rules in a `.kicad_dru`. Always send them along.
- **Never 90° track corners.** Use chamfered corners only.

## 3. Route on the site (free)
- **Start** with `start_autoroute`: a base64 `.kicad_pcb` plus `project_base64` (the `.kicad_pro`), optionally `rules_base64` (the `.kicad_dru`).
  - `layers`: the board's own count, or an even number the user agreed to. The router never adds layers by itself; it stops and asks (`result.ask.layers_needed`).
  - `match_json`: length matching. Presets: `ddr3_st_an5692`, `ddr3_generic`, `ddr4_generic`, `usb2`, `rgmii`, `pcie`. Or custom groups with `ref`/`tol_mm`/`target_mm`/`skew_mm`/`pair_skew_mm`, and `"P,N"` pairs.
  - `plane_nets: "auto"` for plane fan-out. `minutes` 60–120 for big boards.
- **Follow** with `wait_autoroute`, calling again while `still_running` is true. Don't poll `get_autoroute` in a loop.
- **Read the result:**
  - `unrouted` and the "not enough room around Ux" reasons (they say where and how much room);
  - the zone-gap count, KiCad DRC errors, `result.match` (length table) and `result.pairs` (coupling %, P−N);
  - the tracks it moved.
- **Re-run** the same board with other layers or match via `rerun_autoroute(job_id, layers=…)`.
- **Still open connections:** first fix the design (more room, rotate or move parts, a fan-out the router can use, a pin or bit swap within a byte lane). Then route again. Optionally run an AI routing review:
  1. `quote_route_review`, tell the user the number;
  2. `start_route_review(job_id, max_tokens, try_suggestions=true, move_chips=<only if the user agrees>)`.

  The router tries the suggestions for free and keeps only a better result. Chip moves are made on a copy (`routed_moved.kicad_pcb`); the user's board never changes. `try_chip_moves` redoes the moves by hand.
- **Goal:** 0 open, 0 DRC errors, lengths inside the rule, pairs coupled.

## 4. Check the board
- **Routed by the site:** `check_routed_board(job_id)` makes the factory files on the site's side. Use `which="own"` for the result on the original layer count.
- **Own factory zip:** call `how_to_prepare_files(tool="kicad")` first. Then:
  - `check_board` for ≤10 MB;
  - `start_board` → `add_board_file` … → `finish_board`, file by file;
  - REST `POST /api/v1/boards` for files up to 100 MB.
- **Read** with `get_report(run_id)`. Fix every finding at the source, then make a new version with `update_board(run_id, add_or_replace, remove)` (keeps the version chain) or a new routing run.
- **Storage:** checked boards count toward the user's storage (unpacked they are much bigger than the zip). Delete superseded versions with `delete_board`, after asking the user.

## 5. Simulate one board
1. `sim_start(run_id, analog=true, firmware=[…], power_preset="clean")`. Read which parts are simulated, the controls and the warnings, and pass on `does_not_do`.
2. Optional bench parts and instruments: `bench_add_part` (supply, load, generator, probe, resistor …). Points are `U1.5`, `TP1` or a net name. They are added before `sim_start` and never change the board files.
3. Drive the board with `sim_set` (buttons, switches, sliders, supply volts, `power` quality, `serial` text, `keys`). Run with `sim_run(run_ms ≤10000, watch=[{net}|{pin}|{part_current:"supply:J1"}], until=…, capture=…)`. Read the instant state with `sim_read`.
4. New program: `sim_load_firmware` (time resets to 0). Close with `sim_stop`.
5. Check rails against design values. A rail being off can be correct: a regulator whose EN follows an unsimulated part. Also check currents (a large current on an input means a short or a reversed diode), MCU serial output and the LEDs.

## 6. Simulate a system (several boards)
1. `system_create(boards=[{label:"A", run_id}, …])`, 1–6 boards; the same board may appear twice. The boards share nothing, not even ground.
2. Join them with `system_connect`:
   - `kind="connector"`, `a="A:J101"`, `b="B:J1"`: a whole edge connector into a slot, pin by pin;
   - `kind="cable"` with `wires` (include a ground wire), `length_m`, `awg`;
   - `mated` or `joint` for single points.

   Read the answer's wrong-looking pairs (supply meeting ground, etc.) and fix the pinout at the source.
3. `bench_add_part(system_id=…)` for bench supplies or enables (points `A:NET`). Then `system_sim_start(system_id)` and use the `sim_*` tools with `board:name` names (`A:U1`, `B:GND`).
4. Check each board's ground offset, the wire currents and the voltage drops.

## 7. Order
`get_order_package(run_id, factory=jlcpcb|pcbway|oshpark|…, package=bare|assembly|…)`. Pass the verdict, the notes and the rotation reminder to the user. Ordering itself is the user's decision; never place an order for them.

## Loop until done
design/generator → route (site) → check (site) → simulate board and system (site) → fix at the source → repeat.

When reporting progress, give:
- job and report ids;
- open count, DRC errors, length misses;
- findings fixed;
- what was not checked.
