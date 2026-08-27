/** Люксовые фоны под повод Премиум. id нужны, чтобы не повторять антураж при повторной генерации. */

export type LuxuryScene = { id: string; prompt: string };

const S = (id: string, prompt: string): LuxuryScene => ({ id, prompt });

const RESTAURANT: LuxuryScene[] = [
  S("rest-michelin-crystal", " TIME: evening indoor. SCENE: INSIDE a Michelin-star dining room — crystal chandelier, white damask cloths, silver, maître d' aisle, not outdoors. LIGHT: 2700K chandelier + candle clusters on tables, soft loop light on face, linen shadows."),
  S("rest-palace-marble", " TIME: night indoor. SCENE: INSIDE a palace-hotel restaurant — marble columns, tall draped windows, gilt mirrors, set tables. LIGHT: warm 2800K spots above-front, deep elegant falloff, gold catch on glassware."),
  S("rest-chefs-table", " TIME: evening indoor. SCENE: chef's table INSIDE an open luxury kitchen — copper, tasting plates, walnut counter, not a street. LIGHT: focused warm kitchen practicals + soft fill on face, copper bounce."),
  S("rest-private-salon", " TIME: night indoor. SCENE: private dining salon — dark walnut panels, velvet chairs, low candles, closed doors. LIGHT: 2600K candles as key, weak sconce fill, intimate contrast, readable eyes."),
  S("rest-glass-rooftop", " TIME: night indoor. SCENE: INSIDE a glass rooftop restaurant, city skyline through glass, set tables — still indoors. LIGHT: warm interior key camera-left, cool city glow as rim, candles on table."),
  S("rest-omakase", " TIME: evening indoor. SCENE: omakase counter — hinoki wood, lanterns, chef behind the bar, quiet luxury. LIGHT: 2700K lanterns from front-left, soft wood bounce, face sharp."),
  S("rest-wine-cellar", " TIME: night indoor. SCENE: wine-cellar dining — stone vault, bottle walls, candle clusters, one set table. LIGHT: candles below-front as key, stone ambient, no flash."),
  S("rest-brasserie-brass", " TIME: evening indoor. SCENE: grand brasserie INSIDE — brass rails, leather banquettes, mosaic floor, waiters far out of focus. LIGHT: 2800K wall sconces from sides, warm cloth sheen."),
  S("rest-hotel-orangerie", " TIME: evening indoor. SCENE: hotel orangerie restaurant — tall plants in urns, limestone, white cloth, not a park. LIGHT: warm hanging lanterns, soft 3000K, gentle shadows on limestone."),
  S("rest-tasting-room", " TIME: night indoor. SCENE: eight-seat tasting room, black walls, one spotlighted table, gallery hush. LIGHT: single warm key above-front, candles, face loop-lit."),
];

const DATE: LuxuryScene[] = [
  S("date-candles-two", " TIME: night indoor. SCENE: table for two INSIDE a luxury restaurant — many candles, dim room, roses, white cloth, not a garden. LIGHT: 2600K candles as the only key, soft falloff, warm silk sheen, catchlights."),
  S("date-velvet-alcove", " TIME: night indoor. SCENE: velvet alcove in a palace restaurant, candles, heavy drapes, intimate. LIGHT: candle key below-front, 2700K sconces weak fill, moody but readable face."),
  S("date-sommelier", " TIME: evening indoor. SCENE: fine-dining table for two, sommelier far, candles, crystal, hushed. LIGHT: candles + 2800K overhead dimmed, loop light, cloth shadows."),
  S("date-jazz-room", " TIME: night indoor. SCENE: jazz restaurant INSIDE — piano far, candles on every table, dark wood, not a club neon. LIGHT: 2700K candles, amber sconces, face filled."),
  S("date-rain-window", " TIME: night indoor. SCENE: window table for two, rain city lights through glass, candles as key. LIGHT: warm candles camera-left, cool window rim, no neon on skin."),
  S("date-private-booth", " TIME: night indoor. SCENE: private leather booth, low candles, dark walnut, one couple's table. LIGHT: candle cluster key, very soft fill, intimate contrast."),
  S("date-glass-terrace", " TIME: night indoor. SCENE: glass-wrapped terrace restaurant INSIDE, candles, night garden only through glass. LIGHT: 2600K candles, faint exterior glow, face sharp."),
  S("date-tasting-candles", " TIME: night indoor. SCENE: tasting-menu room for two, single candle cluster, black linen, hush. LIGHT: candles below-front, one warm accent, readable eyes."),
  S("date-hotel-bar-table", " TIME: night indoor. SCENE: five-star hotel restaurant, not the bar stools — a proper candlelit table, marble, orchids. LIGHT: 2700K candles + dim chandelier, elegant falloff."),
  S("date-fireplace-room", " TIME: night indoor. SCENE: fireplace dining room in a luxury hotel, two chairs/table, candles, stone hearth. LIGHT: 2500K fire camera-left + candles, warm cloth, face filled."),
];

const YACHT: LuxuryScene[] = [
  S("yacht-teak-sunset", " TIME: golden hour. SCENE: ON a superyacht teak aft deck at sea — railing, superstructure, water, aboard, not shore, not bushes. LIGHT: warm 3000K sun upper right 45°, sea bounce, catchlights."),
  S("yacht-flybridge", " TIME: midday. SCENE: yacht flybridge / sun deck, helm, horizon, ON the yacht. LIGHT: 5200K sun from above, even fill, crisp teak shadows, face not blown."),
  S("yacht-aft-lounge", " TIME: sunset. SCENE: yacht aft-deck lounge, white seating, ON the yacht. LIGHT: amber key camera-left, golden water, rim on hair."),
  S("yacht-salon", " TIME: evening indoor. SCENE: INSIDE yacht main salon — walnut, cream leather, sea through windows. LIGHT: 2800K cabin lamps, soft marine bounce."),
  S("yacht-bow", " TIME: golden hour. SCENE: yacht bow at sea, teak, spray, horizon, ON the yacht. LIGHT: warm low sun from right, long deck shadows."),
  S("yacht-marina", " TIME: late day. SCENE: boarding a white superyacht at a luxury marina, other yachts, not a park. LIGHT: warm sun, water sparkle, contact shadow on teak."),
  S("yacht-deck-dinner", " TIME: evening. SCENE: dinner table ON yacht deck, candles in hurricane lamps, sea dusk. LIGHT: 2700K lamps + last daylight, face readable."),
  S("yacht-night-harbor", " TIME: night. SCENE: ON yacht deck in a city harbor, skyline, teak, railing. LIGHT: warm deck lamps + cool city glow, no neon skin."),
  S("yacht-jacuzzi-deck", " TIME: late day. SCENE: yacht sun-deck jacuzzi area, teak, towels, sea, ON the yacht. LIGHT: golden sun from left, water bounce."),
  S("yacht-bridge", " TIME: afternoon. SCENE: yacht wheelhouse / bridge, instruments, panoramic sea. LIGHT: bright nautical daylight, even, sharp."),
];

const RESORT: LuxuryScene[] = [
  S("resort-infinity", " TIME: golden hour. SCENE: luxury villa infinity pool facing the sea, stone deck, not a city park. LIGHT: warm 3000K sun, water reflections, soft cloth highlights."),
  S("resort-beach-club", " TIME: midday. SCENE: exclusive beach club — white daybeds, turquoise water, palapa far, champagne. LIGHT: soft 5200K sun, even, short shadows, face filled."),
  S("resort-shore", " TIME: golden hour. SCENE: private sandy beach, shoreline, calm sea, not bushes. LIGHT: warm sun upper right, sand bounce under chin."),
  S("resort-cabana", " TIME: late day. SCENE: luxury beach cabana, linen curtains, sea behind. LIGHT: warm sun through linen, soft facial shadow."),
  S("resort-stone-terrace", " TIME: evening. SCENE: resort stone terrace restaurant facing water, lanterns. LIGHT: 2800K lanterns + dusk sea, face readable."),
  S("resort-white-villa", " TIME: morning. SCENE: white cliff villa courtyard, bougainvillea as architecture accent, sea view — not a forest. LIGHT: crisp 5200K, stone bounce."),
  S("resort-spa-pool", " TIME: afternoon. SCENE: hotel spa outdoor pool, limestone, loungers, palms far. LIGHT: bright sun, water sparkle, even fill."),
  S("resort-jetty", " TIME: sunset. SCENE: private wooden jetty, still water, luxury bungalow behind. LIGHT: warm low sun, water mirror, rim on hair."),
];

const YACHT_RESORT: LuxuryScene[] = [
  ...YACHT.slice(0, 6),
  ...RESORT.slice(0, 6),
];

const SKI: LuxuryScene[] = [
  S("ski-courchevel", " TIME: winter day. SCENE: luxury alpine resort slope, snow peaks, groomed piste, chalet far. LIGHT: crisp 5600K, snow bounce under chin."),
  S("ski-chalet-fire", " TIME: evening indoor. SCENE: mountain chalet living room, fireplace, timber, fur throws. LIGHT: 2700K fire camera-left, warm cloth sheen."),
  S("ski-terrace-champagne", " TIME: midday. SCENE: sun terrace of a ski hotel, snow, champagne, peaks. LIGHT: bright snow sun, cool blue shade, face filled."),
  S("ski-cable", " TIME: winter day. SCENE: luxury gondola station / snow plateau, peaks. LIGHT: clear high sun, sparkle, cool shadows."),
  S("ski-spa-snow", " TIME: dusk. SCENE: hotel spa with snow outside floor-to-ceiling glass. LIGHT: warm interior 2800K, cool snow window, face filled."),
  S("ski-suite", " TIME: night indoor. SCENE: alpine suite, timber, sheepskin, mountain night through window. LIGHT: 2700K lamps, cozy falloff."),
  S("ski-village", " TIME: late afternoon. SCENE: luxury ski village street, snow, stone chalets, not a forest wall. LIGHT: warm low winter sun, long shadows."),
  S("ski-restaurant-peak", " TIME: evening indoor. SCENE: peak restaurant INSIDE, panorama windows, snow outside. LIGHT: warm dining light + cool window, candles."),
];

const COUNTRY: LuxuryScene[] = [
  S("country-estate-lawn", " TIME: daytime. SCENE: country estate lawn, manor behind, gravel, not a bush wall. LIGHT: soft 5400K, open-sky fill."),
  S("country-manor-hall", " TIME: afternoon indoor. SCENE: manor hall — stone, staircase, oil portraits, not outdoors. LIGHT: window 5000K camera-left, warm wood fill."),
  S("country-vineyard", " TIME: golden hour. SCENE: vineyard terrace of a wine estate, rows, stone table. LIGHT: warm sun from right, long shadows."),
  S("country-lake-dock", " TIME: golden hour. SCENE: private lake dock, estate house far, wood. LIGHT: warm sun, water bounce, rim on hair."),
  S("country-orangery", " TIME: day indoor. SCENE: estate orangery — glass, citrus trees in urns, limestone. LIGHT: bright greenhouse daylight, soft."),
  S("country-courtyard", " TIME: morning. SCENE: gravel courtyard of a château, fountain, stone facade. LIGHT: soft 5000K, stone bounce."),
  S("country-library", " TIME: evening indoor. SCENE: manor library, books, fireplace, leather. LIGHT: 2700K lamps, fire glow."),
  S("country-picnic-estate", " TIME: afternoon. SCENE: styled picnic on estate lawn, linen, wicker, house in focus behind. LIGHT: dappled sun, not a forest."),
];

const PARTY: LuxuryScene[] = [
  S("party-penthouse", " TIME: night indoor. SCENE: luxury penthouse party, skyline windows, low sofas, champagne. LIGHT: warm practicals + city glow, face filled, no magenta neon."),
  S("party-gallery", " TIME: evening indoor. SCENE: private gallery opening, white walls, art, guests far. LIGHT: clean museum spots + warm fill on face."),
  S("party-villa-night", " TIME: night. SCENE: villa terrace party, lanterns, pool, architecture, not a field. LIGHT: 2800K lanterns, soft, contact shadows."),
  S("party-lounge", " TIME: night indoor. SCENE: exclusive lounge party, velvet, low tables, dim. LIGHT: one 2800K key above-left, readable face."),
  S("party-ballroom-cocktails", " TIME: evening indoor. SCENE: cocktail hour in a grand ballroom, waiters, crystal. LIGHT: chandelier 3000K, gold on fabric."),
  S("party-rooftop-string", " TIME: night. SCENE: rooftop party, string lights, skyline. LIGHT: warm strings + frontal fill, city behind."),
  S("party-mansion-stair", " TIME: evening indoor. SCENE: mansion staircase party, marble, guests below. LIGHT: warm uplight + chandelier, face sharp."),
  S("party-hotel-suite", " TIME: night indoor. SCENE: hotel suite gathering, city view, champagne, not a club. LIGHT: 2700K lamps, elegant."),
];

const CLUB: LuxuryScene[] = [
  S("club-members", " TIME: night indoor. SCENE: private members' club — leather, art, low light, not cheap neon. LIGHT: 2800K lamp key above-left, face clearly lit."),
  S("club-velvet-booth", " TIME: night indoor. SCENE: velvet booth in an exclusive nightclub, dark, bottle service far. LIGHT: warm practical key, dim ambient, no cyan skin."),
  S("club-rooftop", " TIME: night. SCENE: rooftop club, skyline, still upscale, not a rave. LIGHT: warm key + city, face filled."),
  S("club-dj-far", " TIME: night indoor. SCENE: dark luxury club, DJ far out of focus, architecture, not lasers on face. LIGHT: single warm 45° key, readable eyes."),
  S("club-gold-bar", " TIME: night indoor. SCENE: gold-leaf bar of a nightclub, mirrors, stools far. LIGHT: 2700K bar practicals, soft fill."),
  S("club-mezzanine", " TIME: night indoor. SCENE: mezzanine overlooking a luxury dance floor, railing, dark. LIGHT: warm key on subject, floor glow behind."),
  S("club-entrance", " TIME: night. SCENE: velvet-rope entrance of an exclusive club, stone facade, city. LIGHT: warm canopy + cool street, face filled."),
  S("club-cigar", " TIME: night indoor. SCENE: cigar lounge club, leather, wood, quiet luxury. LIGHT: 2600K lamps, moody, sharp face."),
];

const WEDDING: LuxuryScene[] = [
  S("wed-ballroom", " TIME: evening indoor. SCENE: grand wedding ballroom, crystal chandeliers, round tables, florals. LIGHT: 3000K diffusion + 45° accent on cloth."),
  S("wed-palace-stair", " TIME: afternoon indoor. SCENE: palace staircase, marble, floral garland, ceremony guests far. LIGHT: window daylight + warm bounce."),
  S("wed-garden-arch", " TIME: daytime. SCENE: luxury garden ceremony with architecture — colonnade, not a wild forest. LIGHT: soft daylight through leaves, face filled."),
  S("wed-reception-terrace", " TIME: golden hour. SCENE: villa reception terrace, long table, candles unlit yet, hills. LIGHT: warm key camera-right."),
  S("wed-cathedral-door", " TIME: day. SCENE: historic church/palace doors, stone, florals, not bushes as hero. LIGHT: open shade 5400K."),
  S("wed-evening-toasts", " TIME: evening indoor. SCENE: toast in a gilded hall, champagne, chandeliers. LIGHT: warm overhead + candles."),
  S("wed-hotel-lobby", " TIME: afternoon indoor. SCENE: five-star hotel lobby set for a wedding, orchids, marble. LIGHT: soft daylight + lamps."),
  S("wed-night-sparklers", " TIME: night. SCENE: villa courtyard send-off, warm string lights, architecture. LIGHT: 2800K strings, face filled."),
];

const OFFICE: LuxuryScene[] = [
  S("off-ceo-glass", " TIME: daytime indoor. SCENE: CEO glass office, city through windows, walnut desk far. LIGHT: 5500K window key camera-left, weak fill."),
  S("off-marble-lobby", " TIME: morning indoor. SCENE: marble corporate lobby, high ceiling, art, security far. LIGHT: cool daylight from glass, even."),
  S("off-boardroom", " TIME: daytime indoor. SCENE: boardroom with skyline, long table, city. LIGHT: window key, clean wool texture."),
  S("off-business-street", " TIME: overcast day. SCENE: business-district street, glass towers, stone pavement, not park. LIGHT: 6000K open sky, soft shadows."),
  S("off-hotel-business", " TIME: afternoon indoor. SCENE: luxury business-hotel lounge, laptops far, leather. LIGHT: 5000K windows, calm."),
  S("off-law-library", " TIME: day indoor. SCENE: wood-panelled firm library, books, quiet luxury. LIGHT: lamp + window, 4000K mix."),
  S("off-atrium", " TIME: daytime indoor. SCENE: corporate atrium, escalators, stone, daylight. LIGHT: overhead daylight, even, sharp cloth."),
  S("off-terrace-city", " TIME: late day. SCENE: office building terrace, city, glass facade. LIGHT: warm sun, urban shadows."),
];

const SPORT: LuxuryScene[] = [
  S("sport-aman-gym", " TIME: daytime indoor. SCENE: luxury hotel gym, stone, wood, machines far, not a basement gym. LIGHT: cool LEDs + window, face filled."),
  S("sport-rooftop", " TIME: sunrise. SCENE: rooftop workout, skyline, premium mat. LIGHT: warm low sun from left, long shadows."),
  S("sport-boutique", " TIME: morning indoor. SCENE: boutique fitness studio, mirrors, oak, calm. LIGHT: 5000K panels, clean."),
  S("sport-park-path", " TIME: sunrise. SCENE: manicured park path by architecture/embankment, not a bush wall. LIGHT: warm low sun, cool air."),
  S("sport-tennis-club", " TIME: daytime. SCENE: private tennis club terrace, clay far, umbrellas. LIGHT: bright sun, even."),
  S("sport-pool-lap", " TIME: morning indoor. SCENE: hotel lap pool, skylight, limestone. LIGHT: daylight from above, water bounce."),
  S("sport-boxing-luxe", " TIME: day indoor. SCENE: exclusive boxing club, leather, wood, ring far. LIGHT: window key, textured."),
  S("sport-run-embankment", " TIME: morning. SCENE: river embankment run, city, stone, not forest. LIGHT: soft 5200K."),
];

const CAFE: LuxuryScene[] = [
  S("cafe-paris-terrace", " TIME: morning. SCENE: European café terrace on a stone street, facades, not bushes. LIGHT: soft 5000K upper left."),
  S("cafe-hotel-garden", " TIME: afternoon indoor. SCENE: hotel winter-garden café, glass, marble tables. LIGHT: daylight through glass, gentle."),
  S("cafe-department", " TIME: daytime indoor. SCENE: luxury department-store café, mosaic, brass. LIGHT: warm interior 3500K + daylight."),
  S("cafe-cobbles", " TIME: golden afternoon. SCENE: cobblestone street café, architecture, espresso. LIGHT: sun from the right, urban shadows."),
  S("cafe-bookstore", " TIME: afternoon indoor. SCENE: beautiful bookstore café, wood, high windows. LIGHT: 5000K windows, warm wood fill."),
  S("cafe-gallery", " TIME: day indoor. SCENE: museum café, stone, art far, quiet luxury. LIGHT: clean daylight, even."),
  S("cafe-canal", " TIME: morning. SCENE: canal-side café, historic houses, tables. LIGHT: soft overcast 5400K."),
  S("cafe-rooftop-city", " TIME: afternoon. SCENE: rooftop café, city, umbrellas, architecture. LIGHT: bright sun, short shadows."),
];

const THEATRE: LuxuryScene[] = [
  S("th-grand-lobby", " TIME: evening indoor. SCENE: grand theatre lobby, red velvet, gold, chandelier. LIGHT: warm chandelier, gold on fabric."),
  S("th-opera-stair", " TIME: evening indoor. SCENE: opera house staircase, marble, gilt. LIGHT: 3000K, elegant falloff."),
  S("th-gallery", " TIME: daytime indoor. SCENE: white-cube art gallery, concrete, one artwork far. LIGHT: 5000K museum spots."),
  S("th-marquee", " TIME: night. SCENE: theatre entrance, marquee, stone, city. LIGHT: cool marquee + warm fill on face."),
  S("th-box", " TIME: evening indoor. SCENE: private theatre box, velvet, stage glow far. LIGHT: warm box lamp + stage rim."),
  S("th-premiere", " TIME: night. SCENE: premiere steps of a historic theatre, stone, lights, no brand logos. LIGHT: warm key, cool night."),
  S("th-conservatory", " TIME: day indoor. SCENE: concert-hall foyer, tall windows, limestone. LIGHT: daylight, soft."),
  S("th-sculpture-court", " TIME: afternoon. SCENE: museum sculpture court, stone, glass roof. LIGHT: even daylight."),
];

const TRAVEL: LuxuryScene[] = [
  S("tr-first-lounge", " TIME: daytime indoor. SCENE: first-class airport lounge, leather, runway windows. LIGHT: bright cool glass daylight."),
  S("tr-palace-lobby", " TIME: evening indoor. SCENE: palace hotel lobby, marble, orchids, porter far. LIGHT: warm lamps, polished stone."),
  S("tr-amalfi", " TIME: afternoon. SCENE: cliffside hotel terrace, sea, stone, not a forest. LIGHT: Mediterranean sun, vivid but real."),
  S("tr-private-terminal", " TIME: day indoor. SCENE: private aviation terminal, glass, jet far through glass. LIGHT: 5500K, clean."),
  S("tr-train-palace", " TIME: morning. SCENE: historic grand station hall, clock, stone. LIGHT: cool daylight from roof."),
  S("tr-suite-arrival", " TIME: afternoon indoor. SCENE: hotel suite arrival, luggage far, city view. LIGHT: window key, calm."),
  S("tr-souk-luxe", " TIME: late day. SCENE: luxury riad courtyard, tiles, fountain, not a cheap market crush. LIGHT: warm sun, patterned shade."),
  S("tr-lake-como", " TIME: golden hour. SCENE: lakeside villa terrace, water, mountains, architecture. LIGHT: warm sun, water bounce."),
];

const PHOTO: LuxuryScene[] = [
  S("ph-penthouse", " TIME: late day indoor. SCENE: luxury penthouse, skyline windows. LIGHT: strong window key left 45°, editorial contrast."),
  S("ph-marble-foyer", " TIME: daytime indoor. SCENE: marble hotel foyer, columns, editorial empty. LIGHT: window + bounce, sculptural."),
  S("ph-studio-dark", " TIME: indoor studio. SCENE: dark seamless studio, one chair, luxury still. LIGHT: dramatic rim + soft key, face sharp."),
  S("ph-studio-light", " TIME: indoor studio. SCENE: off-white cyclorama, clean, high-end campaign. LIGHT: large soft key 45°, gentle fill."),
  S("ph-rooftop", " TIME: golden hour. SCENE: rooftop terrace, city panorama, architecture. LIGHT: warm key from right, catchlights."),
  S("ph-gallery-empty", " TIME: day indoor. SCENE: empty art gallery, concrete, one light shaft. LIGHT: museum daylight, fashion."),
  S("ph-palace-hall", " TIME: afternoon indoor. SCENE: empty palace hall, mirrors, marble. LIGHT: window stripes, elegant."),
  S("ph-night-street-arch", " TIME: night. SCENE: wet luxury shopping street, stone, lights, architecture, not bushes. LIGHT: warm store glow + fill."),
];

const FESTIVAL: LuxuryScene[] = [
  S("fest-vip-lounge", " TIME: sunset. SCENE: VIP festival lounge — sofas, desert/hills far, not mud. LIGHT: warm low sun, soft fill."),
  S("fest-concert-box", " TIME: night indoor. SCENE: concert hall box, stage glow, velvet. LIGHT: warm box + stage, no lasers on skin."),
  S("fest-art-install", " TIME: late day. SCENE: art installation at a luxury festival, sculpture, open ground. LIGHT: warm late-day, realistic."),
  S("fest-sunset-deck", " TIME: sunset. SCENE: wooden VIP deck, crowd far, sky. LIGHT: backlight sun, frontal fill."),
  S("fest-night-lanterns", " TIME: night. SCENE: lantern field of a boutique festival, silk, not a rave. LIGHT: 2700K lanterns, face filled."),
  S("fest-day-cactus", " TIME: daytime. SCENE: desert festival camp, luxury tent, mountains. LIGHT: hard sun, stylish shade."),
  S("fest-amphitheatre", " TIME: evening. SCENE: stone amphitheatre concert, sky. LIGHT: warm stage far + sky, face key."),
  S("fest-yacht-fest", " TIME: late day. SCENE: festival afterparty ON a yacht deck, sea, music far. LIGHT: golden sun, teak."),
];

const CORP: LuxuryScene[] = [
  S("corp-ballroom", " TIME: evening indoor. SCENE: corporate gala in a hotel ballroom, round tables, branding abstract/blurred. LIGHT: chandelier + warm wash."),
  S("corp-penthouse", " TIME: night indoor. SCENE: penthouse networking, city, champagne. LIGHT: lamps + skyline, face filled."),
  S("corp-club-dining", " TIME: evening indoor. SCENE: private club dining for a company dinner, wood, art. LIGHT: 2800K, candles."),
  S("corp-hotel-foyer", " TIME: evening indoor. SCENE: hotel foyer cocktail, marble, colleagues far. LIGHT: warm overhead, elegant."),
  S("corp-rooftop", " TIME: night. SCENE: rooftop corporate party, city view. LIGHT: evening city glow + warm key."),
  S("corp-award-stage", " TIME: night indoor. SCENE: awards hall, stage far, seats, luxury. LIGHT: warm wash, face key 45°."),
  S("corp-wine-reception", " TIME: evening indoor. SCENE: wine reception in a historic hall, glasses, stone. LIGHT: 2700K sconces."),
  S("corp-board-dinner", " TIME: night indoor. SCENE: long board dinner, city windows, set table. LIGHT: candles + dim spots."),
];

const YOGA: LuxuryScene[] = [
  S("yoga-spa-pavilion", " TIME: morning. SCENE: luxury spa yoga pavilion, teak, garden as architecture, not jungle crush. LIGHT: soft 5200K, calm."),
  S("yoga-hammam", " TIME: daytime indoor. SCENE: marble hammam / spa hall, steam faint, stone. LIGHT: warm lanterns, even."),
  S("yoga-hotel-wellness", " TIME: morning indoor. SCENE: hotel wellness studio, oak, linen, city far through glass. LIGHT: daylight, clean."),
  S("yoga-villa-deck", " TIME: sunrise. SCENE: villa yoga deck, still pool, sea. LIGHT: warm low sun, long shadows."),
  S("yoga-onsen-luxe", " TIME: dusk indoor. SCENE: luxury onsen lounge, wood, stone, steam glass. LIGHT: 2700K, serene."),
  S("yoga-conservatory", " TIME: morning indoor. SCENE: glass conservatory studio, plants in urns, limestone. LIGHT: bright greenhouse daylight."),
  S("yoga-rooftop-calm", " TIME: sunrise. SCENE: rooftop yoga, city quiet, mats. LIGHT: pink morning sun, soft."),
  S("yoga-treatment", " TIME: afternoon indoor. SCENE: spa treatment suite foyer, linen, oils, calm luxury. LIGHT: 3000K lamps."),
];

const KIDS: LuxuryScene[] = [
  S("kids-hotel-brunch", " TIME: daytime indoor. SCENE: five-star family brunch, elegant tables, balloons tasteful, not a plastic playground. LIGHT: daylight + warm lamps."),
  S("kids-villa-garden", " TIME: afternoon. SCENE: villa garden party for children, white linen, topiary, architecture. LIGHT: soft sun."),
  S("kids-tea-room", " TIME: afternoon indoor. SCENE: palace tea room set for a children's celebration, porcelain, florals. LIGHT: 4000K windows."),
  S("kids-museum-hall", " TIME: day indoor. SCENE: museum family hall, stone, educational luxury, not arcade. LIGHT: even daylight."),
  S("kids-yacht-family", " TIME: day. SCENE: family day ON a yacht deck, sea, tasteful, not a park. LIGHT: bright sun, teak."),
  S("kids-restaurant-family", " TIME: evening indoor. SCENE: upscale family restaurant, warm, set table, not fast food. LIGHT: 2800K, candles optional."),
  S("kids-hotel-suite", " TIME: afternoon indoor. SCENE: hotel family suite, elegant, toys minimal, city view. LIGHT: window key."),
  S("kids-orangery-party", " TIME: day indoor. SCENE: orangery birthday, citrus trees, white cake table, luxury. LIGHT: greenhouse daylight."),
];

const SHOP: LuxuryScene[] = [
  S("shop-atrium", " TIME: daytime indoor. SCENE: luxury mall atrium, marble, skylight, boutiques. LIGHT: 5000K daylight, even."),
  S("shop-street", " TIME: afternoon. SCENE: boutique shopping street, stone, display windows, not bushes. LIGHT: open sky, urban."),
  S("shop-department", " TIME: day indoor. SCENE: historic department store hall, wood, galleries. LIGHT: warm interior + skylight."),
  S("shop-arcade", " TIME: day indoor. SCENE: glass shopping arcade, mosaic, brass. LIGHT: daylight through glass roof."),
  S("shop-flagship", " TIME: afternoon indoor. SCENE: flagship boutique interior, stone, clothes rails far, no logos. LIGHT: 4000K spots, clean."),
  S("shop-hotel-arcade", " TIME: day indoor. SCENE: palace hotel shopping arcade, orchids, marble. LIGHT: lamps + daylight."),
  S("shop-evening-vitrine", " TIME: evening. SCENE: evening shopping street, lit vitrines, wet stone. LIGHT: warm shop glow, face filled."),
  S("shop-showroom", " TIME: day indoor. SCENE: private fashion showroom, white, rail, luxury quiet. LIGHT: softboxes even, still photoreal street-adjacent not CGI."),
];

const CITY: LuxuryScene[] = [
  S("city-hotel-entrance", " TIME: afternoon. SCENE: five-star hotel entrance, canopy, stone, doorman far. LIGHT: open daylight, urban."),
  S("city-square", " TIME: morning. SCENE: European square, palazzo, stone, café far. LIGHT: soft 5000K."),
  S("city-penthouse-terrace", " TIME: golden hour. SCENE: penthouse terrace, city, glass. LIGHT: warm sun, long shadows."),
  S("city-bridge", " TIME: late day. SCENE: historic bridge, river, architecture, not park bushes. LIGHT: warm sun from left."),
  S("city-colonnade", " TIME: afternoon. SCENE: stone colonnade, luxury street. LIGHT: striped sun, elegant."),
  S("city-night-boulevard", " TIME: night. SCENE: grand boulevard, lights, Haussmann facades. LIGHT: warm street lamps, face filled."),
  S("city-art-hotel", " TIME: day indoor. SCENE: design-hotel lobby, art, concrete, quiet. LIGHT: 4500K, sculptural."),
  S("city-embankment", " TIME: golden afternoon. SCENE: river embankment, stone, city. LIGHT: sun from the right, urban."),
];

const CATALOG: Record<string, LuxuryScene[]> = {
  restaurant: RESTAURANT,
  date: DATE,
  yacht: YACHT,
  resort: RESORT,
  yachtResort: YACHT_RESORT,
  ski: SKI,
  countryside: COUNTRY,
  party: PARTY,
  club: CLUB,
  wedding: WEDDING,
  office: OFFICE,
  sport: SPORT,
  cafe: CAFE,
  theatre: THEATRE,
  travel: TRAVEL,
  photoshoot: PHOTO,
  festival: FESTIVAL,
  corporate: CORP,
  yoga: YOGA,
  kids: KIDS,
  shopping: SHOP,
  city: CITY,
};

export function detectOccasionKey(text: string): keyof typeof CATALOG {
  const t = (text || "").toLowerCase().replace(/ё/g, "е");
  if (/детск/.test(t)) return "kids";
  if (/йога|\bspa\b|спа\b|wellness/.test(t)) return "yoga";
  if (/горнолыж/.test(t)) return "ski";
  if (/яхт/.test(t) && /курорт/.test(t)) return "yachtResort";
  if (/яхт/.test(t)) return "yacht";
  if (/загородн|пикник|природ/.test(t)) return "countryside";
  if (/пляж|beach/.test(t)) return "resort";
  if (/курорт/.test(t)) return "resort";
  if (/свидан|романтич/.test(t)) return "date";
  if (/ресторан|\bужин\b/.test(t)) return "restaurant";
  if (/ночн\w*\s*клуб|ночной клуб/.test(t)) return "club";
  if (/\bклуб\b/.test(t) && !/beach/.test(t)) return "club";
  if (/вечеринк/.test(t)) return "party";
  if (/свадьб|выпускн|торжеств/.test(t)) return "wedding";
  if (/корпоратив/.test(t)) return "corporate";
  if (/офис|бизнес|деловая/.test(t)) return "office";
  if (/спорт|фитнес/.test(t)) return "sport";
  if (/театр|выставк|опер/.test(t)) return "theatre";
  if (/фестиваль|концерт/.test(t)) return "festival";
  if (/путешеств|самолёт|самолет/.test(t)) return "travel";
  if (/фотосесси/.test(t)) return "photoshoot";
  if (/шопинг/.test(t)) return "shopping";
  if (/прогулк|кафе|casual/.test(t)) return "cafe";
  return "city";
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function occasionVenueHint(text: string): string {
  const key = detectOccasionKey(text);
  const hints: Record<string, string> = {
    restaurant: "дорогой ресторан ВНУТРИ (crystal, мрамор, скатерти) — не улица и не кусты",
    date: "приглушённый ресторан, стол на двоих, свечи, 2700K — не парк",
    yacht: "НА суперъяхте (тик, поручень, море) — не берег",
    resort: "люксовый курорт / beach club / вилла у моря",
    yachtResort: "яхта ИЛИ люксовый курорт — чередовать, всегда глянец",
    ski: "Куршевель / шале / терраса на снегу",
    countryside: "поместье, виноградник, усадьба — не лес кустов",
    party: "пентхаус / вилла / гала, не дешёвая дискотека",
    club: "закрытый members club / тёмный люкс, не неон на коже",
    wedding: "бальный зал / дворец / церемония с архитектурой",
    office: "стеклянный офис / мраморное лобби / деловая улица",
    sport: "премиум-зал отеля / крыша / клуб, не подвал",
    cafe: "европейская терраса кафе, камень, не кусты",
    theatre: "фойе театра / опера / галерея",
    travel: "first class / лобби дворца / терраса у моря",
    photoshoot: "пентхаус / мрамор / студия / крыша — editorial",
    festival: "VIP-лаунж фестиваля / ложа концерта",
    corporate: "бал отеля / penthouse networking",
    yoga: "спа / павильон / хаммам — тихое люкс",
    kids: "семейный люкс: brunch отеля, вилла, не пластиковая площадка",
    shopping: "атриум бутика / пассаж / витрины",
    city: "вход пятизвёздочного отеля / площадь / пентхаус",
  };
  return hints[key] || hints.city;
}

export function pickLuxuryScenes(opts: {
  occasions: string[];
  recentIds?: string[];
  salt?: number;
}): { prompts: string[]; ids: string[] } {
  const recent = new Set(opts.recentIds || []);
  const salt = (opts.salt ?? Date.now()) >>> 0;
  const used = new Set<string>();
  const prompts: string[] = [];
  const ids: string[] = [];

  opts.occasions.forEach((occ, i) => {
    const pool = CATALOG[detectOccasionKey(occ)] || CITY;
    const start = (salt + hashStr(occ || "") + i * 13) % pool.length;
    let chosen = pool[start];
    const tryPick = (allowRecent: boolean) => {
      for (let k = 0; k < pool.length; k++) {
        const cand = pool[(start + k) % pool.length];
        if (used.has(cand.id)) continue;
        if (!allowRecent && recent.has(cand.id)) continue;
        return cand;
      }
      return null;
    };
    chosen = tryPick(false) || tryPick(true) || pool[start];
    used.add(chosen.id);
    ids.push(chosen.id);
    prompts.push(chosen.prompt);
  });

  return { prompts, ids };
}
