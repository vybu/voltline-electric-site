import { quickStartViewerPlugins, RicosViewer } from "@wix/ricos";
import "@wix/ricos/css/all-plugins-viewer.css";

// Build the plugin set once at module scope — not per render.
const plugins = quickStartViewerPlugins();

export default function RicosContent({ content }: { content: unknown }) {
  if (!content) return null;
  return (
    <div className="ricos-content">
      <RicosViewer content={content as any} plugins={plugins} />
    </div>
  );
}
