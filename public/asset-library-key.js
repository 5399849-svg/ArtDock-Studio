export const assetLibraryKey=asset=>encodeURIComponent(JSON.stringify([asset.projectId||'',asset.kind||'',asset.url||'']));
