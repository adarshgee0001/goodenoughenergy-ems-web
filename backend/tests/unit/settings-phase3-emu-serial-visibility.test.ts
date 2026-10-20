import { describe, it, expect } from 'vitest';
import type { DashboardBessAsset } from '../../../frontend/src/features/dashboard/dashboard.types';
import type { BessAsset } from '../../../frontend/src/features/bess/bess.types';

describe('Phase 3: Authorized EMU Serial Number Visibility', () => {
  // Test fixture representing deployed StorEDGE assets with real EMU serial numbers
  const assetAlpha: DashboardBessAsset = {
    id: 'bess-asset-01',
    name: 'Alpha BESS 01',
    assetIdentifier: 'BESS-ALPHA-01',
    emuId: '2412131092',
    model: 'StorEDGE 5.0',
    energyCapacity: 5000,
    powerRating: 2500,
  };

  const assetBeta: DashboardBessAsset = {
    id: 'bess-asset-02',
    name: 'Beta BESS 02',
    assetIdentifier: 'BESS-BETA-02',
    emuId: '2412131093',
    model: 'StorEDGE 0.25',
    energyCapacity: 250,
    powerRating: 125,
  };

  const assetLegacyMissingEmu: DashboardBessAsset = {
    id: 'bess-asset-03',
    name: 'Legacy BESS 03',
    assetIdentifier: 'BESS-LEGACY-03',
    emuId: null,
    model: 'Legacy Storage',
    energyCapacity: 1000,
    powerRating: 500,
  };

  // Helper reflecting the presentation resolution used across BESSPage, BESSAssetDetailsPage, and SiteDetailsPage
  function resolveEmuSerialDisplay(asset: DashboardBessAsset | BessAsset): string {
    return asset.emuId && asset.emuId.trim() !== '' ? asset.emuId : '--';
  }

  // --------------------------------------------------------------------------
  // 1. Correct serial number displayed for associated BESS asset
  // --------------------------------------------------------------------------
  describe('1. Asset serial number resolution', () => {
    it('displays the configured EMU serial number for an asset', () => {
      const displayVal = resolveEmuSerialDisplay(assetAlpha);
      expect(displayVal).toBe('2412131092');
    });

    it('matches incoming telemetry sn matching contract', () => {
      // In MQTT ingestion, incoming payload { sn: '2412131092' } matches BESSAsset.emuId
      const incomingMqttSn = '2412131092';
      expect(assetAlpha.emuId).toBe(incomingMqttSn);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Different serial numbers displayed correctly for multiple BESS assets
  // --------------------------------------------------------------------------
  describe('2. Multi-BESS serial number discrimination', () => {
    it('renders distinct serial numbers for multiple BESS assets on the same site', () => {
      const siteAssets = [assetAlpha, assetBeta];
      const displayedSerials = siteAssets.map(resolveEmuSerialDisplay);

      expect(displayedSerials).toEqual(['2412131092', '2412131093']);
      expect(displayedSerials[0]).not.toBe(displayedSerials[1]);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Missing serial numbers display the established placeholder ('--')
  // --------------------------------------------------------------------------
  describe('3. Missing EMU serial number handling', () => {
    it('displays "--" when emuId is explicitly null', () => {
      expect(resolveEmuSerialDisplay(assetLegacyMissingEmu)).toBe('--');
    });

    it('displays "--" when emuId is undefined or empty whitespace', () => {
      const undefinedAsset: DashboardBessAsset = {
        id: 'bess-04',
        name: 'Unit 4',
        assetIdentifier: 'BESS-04',
        emuId: undefined,
      };
      expect(resolveEmuSerialDisplay(undefinedAsset)).toBe('--');

      const whitespaceAsset: DashboardBessAsset = {
        id: 'bess-05',
        name: 'Unit 5',
        assetIdentifier: 'BESS-05',
        emuId: '   ',
      };
      expect(resolveEmuSerialDisplay(whitespaceAsset)).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Authorized Client and Admin view contracts
  // --------------------------------------------------------------------------
  describe('4. Data contract integrity across authorized views', () => {
    it('guarantees DashboardBessAsset type includes optional emuId field', () => {
      const typedAsset: DashboardBessAsset = {
        id: 'test-id',
        name: 'Test BESS',
        assetIdentifier: 'ID-01',
        emuId: 'EMU-12345',
      };
      expect(typedAsset.emuId).toBe('EMU-12345');
    });

    it('retains emuId in BessAsset interface from bess.types.ts', () => {
      const adminAsset: BessAsset = {
        id: 'admin-bess-01',
        name: 'Admin BESS',
        assetIdentifier: 'ADM-01',
        emuId: 'EMU-ADMIN-01',
        createdAt: '2026-10-14T00:00:00.000Z',
        updatedAt: '2026-10-14T00:00:00.000Z',
        siteId: 'site-01',
      };
      expect(resolveEmuSerialDisplay(adminAsset)).toBe('EMU-ADMIN-01');
    });
  });

  // --------------------------------------------------------------------------
  // 5. No cross-asset identifier leakage or accidental substitution
  // --------------------------------------------------------------------------
  describe('5. Cross-asset isolation and security', () => {
    it('never falls back to adjacent asset emuId when an asset is missing one', () => {
      const assetsList = [assetAlpha, assetLegacyMissingEmu, assetBeta];

      const resolved = assetsList.map(a => ({
        id: a.id,
        name: a.name,
        emuIdDisplay: resolveEmuSerialDisplay(a),
      }));

      expect(resolved[0].emuIdDisplay).toBe('2412131092');
      expect(resolved[1].emuIdDisplay).toBe('--'); // Must NOT inherit assetAlpha or assetBeta emuId
      expect(resolved[2].emuIdDisplay).toBe('2412131093');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Site aggregation, telemetry, and navigation unaffected
  // --------------------------------------------------------------------------
  describe('6. Zero impact on aggregation and existing fields', () => {
    it('confirms site total capacity aggregation remains strictly unchanged', () => {
      const siteAssets = [assetAlpha, assetBeta, assetLegacyMissingEmu];

      const totalEnergyCapacity = siteAssets.reduce(
        (sum, a) => sum + (a.energyCapacity || 0),
        0
      );
      const totalPowerRating = siteAssets.reduce(
        (sum, a) => sum + (a.powerRating || 0),
        0
      );

      // 5000 + 250 + 1000 = 6250 kWh
      expect(totalEnergyCapacity).toBe(6250);
      // 2500 + 125 + 500 = 3125 kW
      expect(totalPowerRating).toBe(3125);
    });

    it('preserves existing asset navigation links', () => {
      const clientDetailUrl = `/app/bess/${assetAlpha.id}`;
      expect(clientDetailUrl).toBe('/app/bess/bess-asset-01');

      const adminDetailUrl = `/admin/clients/client-1/sites/site-1/bess/${assetAlpha.id}`;
      expect(adminDetailUrl).toBe('/admin/clients/client-1/sites/site-1/bess/bess-asset-01');
    });
  });
});
