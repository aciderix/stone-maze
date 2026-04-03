// Barrel re-exports for vegetation module
export { setVegBallPos } from './dissolve';
export { updateGrassUniforms, setGrassBallFade, resetGrassSystem } from './grassSystem';
export { addIvy, addMenuIvy } from './ivyApi';
export { addGrass, addMenuGrass } from './grassPositioning';
export { simulateIvyForRegion } from './ivyRegion';
export { buildIvyMeshesReturn, buildScatterLeavesReturn } from './ivyMeshReturn';
export { computeGrassInRegion } from './grassRegion';
export { DirectionalMeshGroup, buildIvyMeshesDirectional, buildScatterLeavesDirectional, buildGrassMeshReturn } from './ivyDirectional';
