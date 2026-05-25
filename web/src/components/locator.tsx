import { useWorkbench } from "../app/workbench";
import {
  buildEditorUrl,
  resolveOpenTargetLabel,
} from "../lib/assetPath";

function FileLocatorIcon() {
  return (
    <svg className="locator-file-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 2.75h4.5l2.5 2.5v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z" />
      <path d="M9.5 2.75v2.5H12" />
    </svg>
  );
}

export { buildEditorUrl } from "../lib/assetPath";

export function LocatorLink({ locator, assetId }: { locator?: string | null; assetId?: string | null }) {
  const { getProjectBasePathForAsset } = useWorkbench();

  if (!locator) {
    return <>—</>;
  }

  const assetLocalFolder = getProjectBasePathForAsset(assetId);
  const openTarget = resolveOpenTargetLabel(assetLocalFolder, locator);
  const url = buildEditorUrl(assetLocalFolder, locator);
  if (!url) {
    return (
      <span className="locator-inline">
        <span className="locator-value" title={locator}><FileLocatorIcon /></span>
      </span>
    );
  }

  return (
    <span className="locator-inline">
      <a className="locator-link" href={url} title={`Open target: ${openTarget ?? locator}`} aria-label={`Open ${locator} in editor`}>
        <FileLocatorIcon />
      </a>
    </span>
  );
}
