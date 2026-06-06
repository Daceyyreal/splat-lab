/**
 * Renderer wiring around mkkellogg/GaussianSplats3D.
 *
 * The data layer (parse/compress/serialize) is renderer-independent and tested.
 * This module only handles display: load a PLY ArrayBuffer and swap it when the
 * compressed data changes. We re-display by handing GS3D a fresh PLY blob — this
 * uses only its documented load path, so no internal mutation API is needed.
 *
 * NOTE: the exact GS3D method names can vary by version. The calls flagged with
 * `VERIFY` below are the ones to confirm against the installed version when you
 * first run `npm run dev` in the browser.
 */

import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";

export class SplatViewer {
  private viewer: GaussianSplats3D.Viewer;
  private currentUrl: string | null = null;

  constructor(container: HTMLElement) {
    this.viewer = new GaussianSplats3D.Viewer({
      rootElement: container,
      sharedMemoryForWorkers: false, // simpler for GitHub Pages (no COOP/COEP headers)
      sphericalHarmonicsDegree: 2,   // GS3D supports up to degree 2
      dynamicScene: true,
    });
    this.viewer.start();
  }

  /** Load (or reload) the scene from an in-memory PLY buffer. */
  async show(plyBuffer: ArrayBuffer): Promise<void> {
    const blobUrl = URL.createObjectURL(new Blob([plyBuffer], { type: "application/octet-stream" }));
    // VERIFY: removeSplatScene / reset signature against installed GS3D version.
    if (this.currentUrl) {
      await this.viewer.removeSplatScene(0);
      URL.revokeObjectURL(this.currentUrl);
    }
    // VERIFY: addSplatScene options (format enum name) against installed version.
    await this.viewer.addSplatScene(blobUrl, {
      format: GaussianSplats3D.SceneFormat.Ply,
      showLoadingUI: false,
      progressiveLoad: false,
    });
    this.currentUrl = blobUrl;
  }
}
