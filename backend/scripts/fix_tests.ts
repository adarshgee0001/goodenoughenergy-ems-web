const fs = require('fs');

let content = fs.readFileSync('tests/unit/voltage-trend.test.ts', 'utf8');

// For UNKNOWN blocks, change the effective values to 0 and add raw fields
content = content.replace(/activeSource: 'UNKNOWN',\s+gridUab: ([\d\w]+),\s+gridUbc: ([\d\w]+),\s+gridUca: ([\d\w]+),\s+bessUa: ([\d\w]+),\s+bessUb: ([\d\w]+),\s+bessUc: ([\d\w]+),/g, (match, g1, g2, g3, b1, b2, b3) => {
  return `activeSource: 'UNKNOWN',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: ${g1},
      rawGridUbc: ${g2},
      rawGridUca: ${g3},
      rawBessUa: ${b1},
      rawBessUb: ${b2},
      rawBessUc: ${b3},`;
});

// For GRID blocks, append raw fields
content = content.replace(/activeSource: 'GRID',\s+gridUab: ([\d\w]+),\s+gridUbc: ([\d\w]+),\s+gridUca: ([\d\w]+),\s+bessUa: ([\d\w]+),\s+bessUb: ([\d\w]+),\s+bessUc: ([\d\w]+),/g, (match, g1, g2, g3, b1, b2, b3) => {
  return `activeSource: 'GRID',
      gridUab: ${g1},
      gridUbc: ${g2},
      gridUca: ${g3},
      bessUa: ${b1},
      bessUb: ${b2},
      bessUc: ${b3},
      rawGridUab: ${g1},
      rawGridUbc: ${g2},
      rawGridUca: ${g3},
      rawBessUa: ${b1},
      rawBessUb: ${b2},
      rawBessUc: ${b3},`; // In the test inputs, raw voltages are mostly the same as effective, except when suppressed
});

// For BESS blocks, append raw fields
content = content.replace(/activeSource: 'BESS',\s+gridUab: ([\d\w]+),\s+gridUbc: ([\d\w]+),\s+gridUca: ([\d\w]+),\s+bessUa: ([\d\w]+),\s+bessUb: ([\d\w]+),\s+bessUc: ([\d\w]+),/g, (match, g1, g2, g3, b1, b2, b3) => {
  return `activeSource: 'BESS',
      gridUab: ${g1},
      gridUbc: ${g2},
      gridUca: ${g3},
      bessUa: ${b1},
      bessUb: ${b2},
      bessUc: ${b3},
      rawGridUab: ${g1},
      rawGridUbc: ${g2},
      rawGridUca: ${g3},
      rawBessUa: ${b1},
      rawBessUb: ${b2},
      rawBessUc: ${b3},`;
});

fs.writeFileSync('tests/unit/voltage-trend.test.ts', content);
