const fs = require('fs');

let content = fs.readFileSync('tests/unit/voltage-trend.test.ts', 'utf8');

content = content.replace(
/activeSource: 'GRID',\s+gridUab: 230,\s+gridUbc: 231,\s+gridUca: 229,\s+bessUa: 0,\s+bessUb: 0,\s+bessUc: 0,\s+rawGridUab: 230,\s+rawGridUbc: 231,\s+rawGridUca: 229,\s+rawBessUa: 0,\s+rawBessUb: 0,\s+rawBessUc: 0,/g,
`activeSource: 'GRID',
      gridUab: 230,
      gridUbc: 231,
      gridUca: 229,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,`
);

content = content.replace(
/activeSource: 'BESS',\s+gridUab: 0,\s+gridUbc: 0,\s+gridUca: 0,\s+bessUa: 400,\s+bessUb: 401,\s+bessUc: 402,\s+rawGridUab: 0,\s+rawGridUbc: 0,\s+rawGridUca: 0,\s+rawBessUa: 400,\s+rawBessUb: 401,\s+rawBessUc: 402,/g,
`activeSource: 'BESS',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 400,
      bessUb: 401,
      bessUc: 402,
      rawGridUab: 230,
      rawGridUbc: 231,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,`
);

content = content.replace(
/activeSource: 'GRID',\s+gridUab: 0,\s+gridUbc: null,\s+gridUca: 229,\s+bessUa: 0,\s+bessUb: 0,\s+bessUc: 0,\s+rawGridUab: 0,\s+rawGridUbc: null,\s+rawGridUca: 229,\s+rawBessUa: 0,\s+rawBessUb: 0,\s+rawBessUc: 0,/g,
`activeSource: 'GRID',
      gridUab: 0,
      gridUbc: null,
      gridUca: 229,
      bessUa: 0,
      bessUb: 0,
      bessUc: 0,
      rawGridUab: 0,
      rawGridUbc: null,
      rawGridUca: 229,
      rawBessUa: 400,
      rawBessUb: 401,
      rawBessUc: 402,`
);

content = content.replace(
/activeSource: 'BESS',\s+gridUab: 0,\s+gridUbc: 0,\s+gridUca: 0,\s+bessUa: 402,\s+bessUb: 402,\s+bessUc: 402,\s+rawGridUab: 0,\s+rawGridUbc: 0,\s+rawGridUca: 0,\s+rawBessUa: 402,\s+rawBessUb: 402,\s+rawBessUc: 402,/g,
`activeSource: 'BESS',
      gridUab: 0,
      gridUbc: 0,
      gridUca: 0,
      bessUa: 402,
      bessUb: 402,
      bessUc: 402,
      rawGridUab: 402,
      rawGridUbc: 402,
      rawGridUca: 402,
      rawBessUa: 402,
      rawBessUb: 402,
      rawBessUc: 402,`
);

content = content.replace(/expect\(expired\.gridUab\)\.toBe\(400\);\s*\/\/\s*Raw voltage retained/g, 'expect(expired.gridUab).toBe(0);');
content = content.replace(/expect\(validBeforeExpiry\.gridUab\)\.toBe\(0\);/g, 'expect(validBeforeExpiry.gridUab).toBe(0);');
content = content.replace(/expect\(expired\.activeSource\)\.toBe\('UNKNOWN'\);/g, `expect(expired.activeSource).toBe('UNKNOWN');\n    expect(expired.rawGridUab).toBe(400);`);

fs.writeFileSync('tests/unit/voltage-trend.test.ts', content);
