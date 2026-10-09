# Gegenprobe A1 über SIC-Codes

Stand: 2026-10-09. Erzeugt mit `node scripts/sic-check.mjs` (SIC-Codes von der SEC, Zuordnung nach src/screening/industryRules.js).
Gilt nur für die Datenquellen „sec“ und „sec_fmp“. Im FMP-Modus bleibt A1 bei der Branche und Beschreibung des FMP-Profils.

## a) Zusammenfassung

503 Aktien im Universum.

| Behandlung | Anzahl |
| --- | --- |
| Ausschluss (exclude) | 59 |
| manuelle Prüfung (review) | 31 |
| über B3 (b3_focus) | 77 |
| erlaubt (allow) | 333 |
| ohne SIC (unknown) | 3 |

Zusätzlich: C2 Blank Check (SIC 6770): 0; A3 manuell (SIC 5094): 0.

Ticker-Listen (Festlegungen 09.10.2026, nur bei SEC-Daten):

| Liste | Behandlung | Gruppe | Ticker (nicht im Universum: kursiv) |
| --- | --- | --- | --- |
| ALCOHOL_TICKERS | Ausschluss | alcohol | STZ, BF-B |
| CASINO_TICKERS | Ausschluss | gambling | LVS, WYNN, MGM, *CZR* |
| RIBA_TICKERS | Ausschluss | riba | GS, MS, SCHW, APO |
| GAMES_TICKERS | manuelle Prüfung | film_streaming_games | EA, TTWO |
| DEFENSE_REVIEW_TICKERS | manuelle Prüfung | defense | GE, HWM |
| PAYMENT_NETWORK_TICKERS | über B3 | financial_other | V, MA, PYPL, FISV, FIS, GPN, CPAY, XYZ |
| MUSIC_ALSO_TICKERS | zusätzlich über B3 | music | LYV |

## b) Änderungen gegenüber FMP (4 von 17 Titeln mit FMP-Ergebnis)

| Ticker | Name | SIC | FMP-Branche | alt (FMP) → neu (SIC) |
| --- | --- | --- | --- | --- |
| AAPL | Apple Inc. | 3571 Electronic Computers | Consumer Electronics | über B3 (music) → erlaubt |
| AMZN | Amazon.com, Inc. | 5961 Retail-Catalog & Mail-Order Houses | Specialty Retail | über B3 (music) → erlaubt |
| COIN | Coinbase Global, Inc. | 6199 Finance Services | Financial - Data & Stock Exchanges | über B3 (financial_other) → manuelle Prüfung (riba) |
| KO | Coca-Cola Company (The) | 2080 Beverages | Beverages - Non-Alcoholic | erlaubt → über B3 (consumer_realestate) |

## c) Ausschluss und manuelle Prüfung, nach Gruppe

### Ausschluss (59)

| Gruppe | Ticker | Name | SIC | Ticker-Liste |
| --- | --- | --- | --- | --- |
| alcohol | BF-B | Brown Forman Inc | 2080 Beverages | ALCOHOL_TICKERS |
| alcohol | STZ | Constellation Brands, Inc. | 2080 Beverages | ALCOHOL_TICKERS |
| alcohol | TAP | Molson Coors Beverage Company | 2082 Malt Beverages |  |
| defense (Auslegung) | AXON | Axon Enterprise, Inc. | 3480 Ordnance & Accessories, (No Vehicles/Guided Missiles) |  |
| gambling | LVS | Las Vegas Sands Corp. | 7011 Hotels & Motels | CASINO_TICKERS |
| gambling | MGM | MGM Resorts International | 7011 Hotels & Motels | CASINO_TICKERS |
| gambling | WYNN | Wynn Resorts, Limited | 7011 Hotels & Motels | CASINO_TICKERS |
| riba | ACGL | Arch Capital Group Ltd. | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | AFL | AFLAC Incorporated | 6321 Accident & Health Insurance |  |
| riba | AIG | American International Group, I | 6331 Fire, Marine & Casualty Insurance |  |
| riba | AIZ | Assurant, Inc. | 6399 Insurance Carriers, NEC |  |
| riba (Auslegung) | AJG | Arthur J. Gallagher & Co. | 6411 Insurance Agents, Brokers & Service |  |
| riba | ALL | Allstate Corporation (The) | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | AON | Aon plc | 6411 Insurance Agents, Brokers & Service |  |
| riba (Auslegung) | APO | Apollo Global Management, Inc. | 6282 Investment Advice | RIBA_TICKERS |
| riba | BAC | Bank of America Corporation | 6021 National Commercial Banks |  |
| riba | BNY | The Bank of New York Mellon Cor | 6022 State Commercial Banks |  |
| riba | BRK-B | Berkshire Hathaway Inc. New | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | BRO | Brown & Brown, Inc. | 6411 Insurance Agents, Brokers & Service |  |
| riba | C | Citigroup, Inc. | 6021 National Commercial Banks |  |
| riba | CB | Chubb Limited | 6331 Fire, Marine & Casualty Insurance |  |
| riba | CFG | Citizens Financial Group, Inc. | 6022 State Commercial Banks |  |
| riba (Auslegung) | CI | The Cigna Group | 6324 Hospital & Medical Service Plans |  |
| riba | CINF | Cincinnati Financial Corporatio | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | CNC | Centene Corporation | 6324 Hospital & Medical Service Plans |  |
| riba | COF | Capital One Financial Corporati | 6021 National Commercial Banks |  |
| riba | EG | Everest Group, Ltd. | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | ELV | Elevance Health, Inc. | 6324 Hospital & Medical Service Plans |  |
| riba (Auslegung) | ERIE | Erie Indemnity Company | 6411 Insurance Agents, Brokers & Service |  |
| riba | FITB | Fifth Third Bancorp | 6022 State Commercial Banks |  |
| riba | GL | Globe Life Inc. | 6311 Life Insurance |  |
| riba (Auslegung) | GS | Goldman Sachs Group, Inc. (The) | 6211 Security Brokers, Dealers & Flotation Companies | RIBA_TICKERS |
| riba | HBAN | Huntington Bancshares Incorpora | 6021 National Commercial Banks |  |
| riba | HIG | The Hartford Insurance Group, I | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | HUM | Humana Inc. | 6324 Hospital & Medical Service Plans |  |
| riba | JPM | JP Morgan Chase & Co. | 6021 National Commercial Banks |  |
| riba | KEY | KeyCorp | 6021 National Commercial Banks |  |
| riba | L | Loews Corporation | 6331 Fire, Marine & Casualty Insurance |  |
| riba | MET | MetLife, Inc. | 6311 Life Insurance |  |
| riba (Auslegung) | MRSH | Marsh | 6411 Insurance Agents, Brokers & Service |  |
| riba (Auslegung) | MS | Morgan Stanley | 6211 Security Brokers, Dealers & Flotation Companies | RIBA_TICKERS |
| riba | MTB | M&T Bank Corporation | 6022 State Commercial Banks |  |
| riba | NTRS | Northern Trust Corporation | 6022 State Commercial Banks |  |
| riba (Auslegung) | PFG | Principal Financial Group Inc | 6321 Accident & Health Insurance |  |
| riba | PGR | Progressive Corporation (The) | 6331 Fire, Marine & Casualty Insurance |  |
| riba | PNC | PNC Financial Services Group, I | 6021 National Commercial Banks |  |
| riba | PRU | Prudential Financial, Inc. | 6311 Life Insurance |  |
| riba | RF | Regions Financial Corporation | 6021 National Commercial Banks |  |
| riba (Auslegung) | SCHW | Charles Schwab Corporation (The | 6211 Security Brokers, Dealers & Flotation Companies | RIBA_TICKERS |
| riba | STT | State Street Corporation | 6022 State Commercial Banks |  |
| riba | TFC | Truist Financial Corporation | 6021 National Commercial Banks |  |
| riba | TRV | The Travelers Companies, Inc. | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | UNH | UnitedHealth Group Incorporated | 6324 Hospital & Medical Service Plans |  |
| riba | USB | U.S. Bancorp | 6021 National Commercial Banks |  |
| riba | WFC | Wells Fargo & Company | 6021 National Commercial Banks |  |
| riba | WRB | W.R. Berkley Corporation | 6331 Fire, Marine & Casualty Insurance |  |
| riba (Auslegung) | WTW | Willis Towers Watson Public Lim | 6411 Insurance Agents, Brokers & Service |  |
| tobacco (Auslegung) | MO | Altria Group, Inc. | 2111 Cigarettes |  |
| tobacco (Auslegung) | PM | Philip Morris International Inc | 2111 Cigarettes |  |

### manuelle Prüfung (31)

| Gruppe | Ticker | Name | SIC | Ticker-Liste |
| --- | --- | --- | --- | --- |
| defense (Auslegung) | BA | Boeing Company (The) | 3721 Aircraft |  |
| defense (Auslegung) | GD | General Dynamics Corporation | 3730 Ship & Boat Building & Repairing |  |
| defense (Auslegung) | GE | GE Aerospace | 3600 Electronic & Other Electrical Equipment (No Computer Equip) | DEFENSE_REVIEW_TICKERS |
| defense (Auslegung) | GRMN | Garmin Ltd. | 3812 Search, Detection, Navigation, Guidance, Aeronautical Sys |  |
| defense (Auslegung) | HII | Huntington Ingalls Industries, | 3730 Ship & Boat Building & Repairing |  |
| defense (Auslegung) | HON | Honeywell International Inc. | 3724 Aircraft Engines & Engine Parts |  |
| defense (Auslegung) | HONA | Honeywell Aerospace Inc. | 3724 Aircraft Engines & Engine Parts |  |
| defense (Auslegung) | HWM | Howmet Aerospace Inc. | 3350 Rolling Drawing & Extruding of  Nonferrous Metals | DEFENSE_REVIEW_TICKERS |
| defense (Auslegung) | LHX | L3Harris Technologies, Inc. | 3812 Search, Detection, Navigation, Guidance, Aeronautical Sys |  |
| defense (Auslegung) | LMT | Lockheed Martin Corporation | 3760 Guided Missiles & Space Vehicles & Parts |  |
| defense (Auslegung) | NOC | Northrop Grumman Corporation | 3812 Search, Detection, Navigation, Guidance, Aeronautical Sys |  |
| defense (Auslegung) | RTX | RTX Corporation | 3724 Aircraft Engines & Engine Parts |  |
| defense (Auslegung) | TDG | Transdigm Group Incorporated | 3728 Aircraft Parts & Auxiliary Equipment, NEC |  |
| defense (Auslegung) | TDY | Teledyne Technologies Incorpora | 3812 Search, Detection, Navigation, Guidance, Aeronautical Sys |  |
| defense (Auslegung) | TXT | Textron Inc. | 3720 Aircraft & Parts |  |
| film_streaming_games | CHTR | Charter Communications, Inc. | 4841 Cable & Other Pay Television Services |  |
| film_streaming_games | CMCSA | Comcast Corporation | 4841 Cable & Other Pay Television Services |  |
| film_streaming_games | DIS | Walt Disney Company (The) | 7990 Services-Miscellaneous Amusement & Recreation |  |
| film_streaming_games | EA | Electronic Arts Inc. | — (SEC: Ticker EA nicht in company_tickers.json) | GAMES_TICKERS |
| film_streaming_games | FOX | Fox Corporation | 4833 Television Broadcasting Stations |  |
| film_streaming_games | FOXA | Fox Corporation | 4833 Television Broadcasting Stations |  |
| film_streaming_games + music | LYV | Live Nation Entertainment, Inc. | 7900 Services-Amusement & Recreation Services |  |
| film_streaming_games | NFLX | Netflix, Inc. | 7841 Services-Video Tape Rental |  |
| film_streaming_games | TKO | TKO Group Holdings, Inc. | 7900 Services-Amusement & Recreation Services |  |
| film_streaming_games | TTWO | Take-Two Interactive Software, | 7372 Services-Prepackaged Software | GAMES_TICKERS |
| film_streaming_games | WBD | Warner Bros. Discovery, Inc. - | 4841 Cable & Other Pay Television Services |  |
| pork | HRL | Hormel Foods Corporation | 2011 Meat Packing Plants |  |
| pork | TSN | Tyson Foods, Inc. | 2015 Poultry Slaughtering and Processing |  |
| riba | AXP | American Express Company | 6199 Finance Services |  |
| riba | COIN | Coinbase Global, Inc. | 6199 Finance Services |  |
| riba | SYF | Synchrony Financial | 6199 Finance Services |  |

## d) Auffällige „erlaubt“-Fälle (7)

Name oder SIC-Beschreibung deutet auf Alkohol, Casino, Bank, Versicherung, Kredit, Rüstung, Tabak, Fleisch, Film, Musik oder Games hin. Grobe Wortsuche, viele Fehltreffer möglich.

| Ticker | Name | SIC | Hinweis |
| --- | --- | --- | --- |
| BBY | Best Buy Co., Inc. | 5731 Retail-Radio, Tv & Consumer Electronics Stores | Film |
| BR | Broadridge Financial Solutions, | 7389 Services-Business Services, NEC | Bank/Kredit |
| HAS | Hasbro, Inc. | 3944 Games, Toys & Children's Vehicles (No Dolls & Bicycles) | Games |
| MSI | Motorola Solutions, Inc. | 3663 Radio & Tv Broadcasting & Communications Equipment | Film |
| PG | Procter & Gamble Company (The) | 2840 Soap, Detergents, Cleang Preparations, Perfumes, Cosmetics | Casino |
| QCOM | QUALCOMM Incorporated | 3663 Radio & Tv Broadcasting & Communications Equipment | Film |
| STLD | Steel Dynamics, Inc. | 3312 Steel Works, Blast Furnaces & Rolling Mills (Coke Ovens) | Rüstung |

### Erlaubt, als Auslegungsfrage gekennzeichnet (3)

| Ticker | Name | SIC |
| --- | --- | --- |
| EFX | Equifax, Inc. | 7320 Services-Consumer Credit Reporting, Collection Agencies |
| MCO | Moody's Corporation | 7320 Services-Consumer Credit Reporting, Collection Agencies |
| SPGI | S&P Global Inc. | 7320 Services-Consumer Credit Reporting, Collection Agencies |

## Ohne SIC-Code (3)

| Ticker | Name | Grund |
| --- | --- | --- |
| AVB | AvalonBay Communities, Inc. | SEC: Ticker AVB nicht in company_tickers.json |
| EQR | Equity Residential | SEC: Ticker EQR nicht in company_tickers.json |
| PSKY | Paramount Skydance Corporation | SEC: Ticker PSKY nicht in company_tickers.json |
