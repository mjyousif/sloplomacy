# Europe 1901 Map Data & Topology (`topology.py`)

The spatial topology of the European theatre is defined in `backend/engine/topology.py`. It establishes a symmetric, bidirectional graph for land and maritime movement, supply center ownership, and dual-coast mechanics.

---

## Map Statistics

- **Total Provinces**: 76
  - **Playable Provinces**: 75 (14 Land, 42 Coastal, 19 Sea)
  - **Impassable Province**: 1 (`SWI` — Switzerland, impassable by both land and sea)
- **Supply Centers (SCs)**: 34
  - **Home Supply Centers**: 22 (3 each for England, France, Germany, Italy, Austria, Turkey; 4 for Russia)
  - **Neutral Supply Centers**: 12 (`BEL`, `BUL`, `DEN`, `GRE`, `HOL`, `NWY`, `POR`, `RUM`, `SER`, `SPA`, `SWE`, `TUN`)
- **Victory Condition**: Controlling 18 or more supply centers.

---

## Dual & Split Coast Mechanics

Three coastal provinces feature split coastlines that severely restrict fleet movement:

### 1. St. Petersburg (`STP`)
- **North Coast (`NC`)**: Accessible to/from `BAR` (Barents Sea) and `NWY` (Norway).
- **South Coast (`SC`)**: Accessible to/from `FIN` (Finland), `BOT` (Gulf of Bothnia), and `LVN` (Livonia).
- *Rule*: A fleet entering `STP` must specify either `NC` or `SC`. Once landed on a coast, it can only move to sea zones touching that specific coast, unless ordered to another province. Armies disregard coasts.

### 2. Spain (`SPA`)
- **North Coast (`NC`)**: Adjacent to `MAO`, `GAS`, and `POR`.
- **South Coast (`SC`)**: Adjacent to `MAO`, `POR`, `WES`, `LYO`, and `MAR`.

### 3. Bulgaria (`BUL`)
- **East Coast (`EC`)**: Adjacent to `RUM`, `BLA` (Black Sea), and `CON`.
- **South Coast (`SC`)**: Adjacent to `CON`, `AEG` (Aegean Sea), and `GRE`.

---

## Adjacency Representation

Each province is instantiated as a `ProvinceInfo` model:

```python
class ProvinceInfo(BaseModel):
    id: str                                  # 3-letter code (e.g. "SPA")
    name: str                                # Full name (e.g. "Spain")
    type: ProvinceType                       # LAND, COAST, SEA, or IMPASSABLE
    is_supply_center: bool                   # True for 34 SCs
    home_power: Optional[Power]              # Owning nation in 1901
    coasts: List[str]                        # Split coast flags: ["NC", "SC"]
    army_adj: List[str]                      # Adjacent provinces for Armies
    fleet_adj: Dict[str, List[str]]          # Adjacencies for Fleets by coast
```

### Coast Notation in Adjacencies
Split-coast adjacencies use slash syntax:
- `"SPA/NC"`: North Coast of Spain
- `"SPA/SC"`: South Coast of Spain
- `"STP/NC"`: North Coast of St. Petersburg
- `"STP/SC"`: South Coast of St. Petersburg
- `"BUL/EC"`: East Coast of Bulgaria
- `"BUL/SC"`: South Coast of Bulgaria

---

## Helper Functions

### `can_unit_move_directly(unit_type, origin, origin_coast, target, target_coast) -> (bool, str)`
Evaluates whether a piece can march or sail between two provinces:
- Armies check `army_adj`.
- Fleets look up `fleet_adj` using `origin_coast` or `""` and check if `target` or `f"{target}/{target_coast}"` is listed.

### `can_army_be_convoyed_theoretically(origin, target) -> bool`
Returns `True` if both origin and target are coastal provinces, the destination is not impassable, and at least one coastal sea zone touches each province.

### `can_unit_support_province(unit_type, origin, origin_coast, target_province) -> bool`
Returns `True` if the unit can legally attack `target_province`. (Note: In standard Diplomacy rules, a fleet can support an action into a coastal province via any of its coasts, even if the fleet could only enter one specific coast).
