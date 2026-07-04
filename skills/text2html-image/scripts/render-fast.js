const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { listHtmlEntries } = require('./utils/html-entries');
const { inspectRenderProfile } = require('./utils/render-profile');
const { compilePosterIr } = require('./utils/poster-ir');
const { compileSvg } = require('./utils/svg-compiler');
const { Resvg } = require('@resvg/resvg-js');

function renderSvgToPng(svg, pngPath, scale) {
  const renderer = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: scale,
    },
    font: {
      loadSystemFonts: true,
    },
  });
  const pngData = renderer.render();
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, pngData.asPng());
}

function main() {
  const args = parseArgs();
  const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
  const entries = listHtmlEntries(projectPaths, { group: args.group });
  const scale = Number(args.scale || 1);
  const profileEntries = entries.map((entry) => {
    const profile = inspectRenderProfile(entry.html);
    if (profile.status === 'pass') {
      const ir = compilePosterIr(entry.html);
      const irDir = path.join(projectPaths.reports, 'render-ir');
      const irPath = path.join(irDir, `${entry.html_group}.${entry.variant}.json`);
      writeJson(irPath, ir);
      const svgDir = path.join(projectPaths.working, 'render-svg');
      const svgPath = path.join(svgDir, `${entry.html_group}-${entry.variant}.svg`);
      const svg = compileSvg(ir);
      fs.mkdirSync(svgDir, { recursive: true });
      fs.writeFileSync(svgPath, svg);
      const pngPath = path.join(projectPaths.exports, `${entry.html_group}-${entry.variant}.png`);
      if (!args['profile-only']) {
        renderSvgToPng(svg, pngPath, scale);
      }
      return {
        ...entry,
        ...profile,
        ir_path: irPath,
        svg_path: svgPath,
        png: args['profile-only'] ? undefined : pngPath,
        scale,
      };
    }
    return { ...entry, ...profile };
  });
  const report = {
    generated_at: new Date().toISOString(),
    project_id: projectPaths.project_id,
    subproject_id: projectPaths.subproject_id,
    mode: args['profile-only'] ? 'profile-only' : 'export-fast',
    status: profileEntries.every((entry) => entry.status === 'pass') ? 'pass' : 'partial',
    entries: profileEntries,
  };
  const reportPath = path.join(projectPaths.reports, 'render-profile-report.json');
  writeJson(reportPath, report);
  console.log(`Render profile report written: ${reportPath}`);
  if (!args['profile-only']) {
    const exported = profileEntries.filter((entry) => entry.status === 'pass' && entry.png);
    const failed = profileEntries.filter((entry) => entry.status !== 'pass');
    const pngReport = {
      generated_at: new Date().toISOString(),
      project_id: projectPaths.project_id,
      subproject_id: projectPaths.subproject_id,
      renderer: 'direct-html-svg-resvg',
      status: failed.length ? 'partial' : 'pass',
      exports: exported.map((entry) => ({
        html_group: entry.html_group,
        variant: entry.variant,
        html: entry.html,
        svg: entry.svg_path,
        png: entry.png,
        scale: entry.scale,
        canvas: entry.canvas,
        output_pixels: {
          width: entry.canvas.width * entry.scale,
          height: entry.canvas.height * entry.scale,
        },
      })),
      failed: failed.map((entry) => ({
        html_group: entry.html_group,
        variant: entry.variant,
        html: entry.html,
        unsupported_css: entry.unsupported_css,
        errors: entry.errors,
      })),
    };
    writeJson(path.join(projectPaths.reports, 'png-export-report.json'), pngReport);
    if (exported.length) console.log(`Direct PNG export completed for ${exported.length} HTML preview(s).`);
    if (!exported.length) {
      console.error('No PNG files exported because no HTML entry passed the direct render profile.');
      process.exit(1);
    }
  }
}

main();
