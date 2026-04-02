/**
 * CFD SIMPLE Solver Node.js Tests
 * Run: node cfd-test-node.js
 * Tests the core physics without needing a browser/Worker
 */

function createSolver(config) {
  const { nx, ny, nz, dx, dy, dz, cellType, rho, mu, Uin, dirAxis, dirSign, k_in, eps_in, maxIter, tol } = config;
  const N = nx * ny * nz;
  const idx = (i, j, k) => i + j * nx + k * nx * ny;
  const Cmu = 0.09;
  const u = new Float64Array(N), v = new Float64Array(N), w = new Float64Array(N);
  const p = new Float64Array(N);
  const k = new Float64Array(N), eps = new Float64Array(N), nut = new Float64Array(N);
  const pp = new Float64Array(N);
  const aP_u = new Float64Array(N), aP_v = new Float64Array(N), aP_w = new Float64Array(N);
  const alphaU = 0.7, alphaP = 0.3;
  for (let ii = 0; ii < N; ii++) {
    if (cellType[ii] !== 1) {
      if (dirAxis === 0) u[ii] = Uin * dirSign; else v[ii] = Uin * dirSign;
      k[ii] = k_in; eps[ii] = eps_in; nut[ii] = Cmu * k_in * k_in / (eps_in + 1e-30);
    }
  }
  const Ax = dy * dz, Ay = dx * dz, Az = dx * dy, vol = dx * dy * dz;

  function applyBC(field, bcType) {
    for (let j = 0; j < ny; j++) for (let kk = 0; kk < nz; kk++) {
      const iIn = dirAxis === 0 ? (dirSign > 0 ? 0 : nx - 1) : 0;
      const iOut = dirAxis === 0 ? (dirSign > 0 ? nx - 1 : 0) : nx - 1;
      if (bcType === 'vel_u') { field[idx(iIn, j, kk)] = dirAxis === 0 ? Uin * dirSign : 0; field[idx(iOut, j, kk)] = field[idx(Math.max(0, Math.min(nx-1, iOut - (dirSign>0?1:-1))), j, kk)] || 0; }
      else if (bcType === 'vel_v') { field[idx(iIn, j, kk)] = dirAxis === 1 ? Uin * dirSign : 0; field[idx(iOut, j, kk)] = field[idx(Math.max(0, Math.min(nx-1, iOut - 1)), j, kk)]; }
      else if (bcType === 'vel_w') { field[idx(iIn, j, kk)] = 0; field[idx(iOut, j, kk)] = field[idx(Math.max(0, Math.min(nx-1, iOut - 1)), j, kk)]; }
      else if (bcType === 'p') { field[idx(iOut, j, kk)] = 0; field[idx(iIn, j, kk)] = field[idx(iIn + (dirSign > 0 ? 1 : -1), j, kk)] || 0; }
    }
    for (let i = 0; i < nx; i++) for (let kk = 0; kk < nz; kk++) {
      if (bcType === 'vel_v') { field[idx(i,0,kk)] = 0; field[idx(i,ny-1,kk)] = 0; }
      else { field[idx(i,0,kk)] = field[idx(i,1,kk)]; field[idx(i,ny-1,kk)] = field[idx(i,ny-2,kk)]; }
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (bcType.startsWith('vel')) field[idx(i,j,0)] = 0; else field[idx(i,j,0)] = field[idx(i,j,1)];
      if (bcType === 'vel_w') field[idx(i,j,nz-1)] = 0; else field[idx(i,j,nz-1)] = field[idx(i,j,nz-2)];
    }
    for (let ii = 0; ii < N; ii++) { if (cellType[ii] === 1) field[ii] = 0; }
  }

  function solveGS(aP,aE,aW,aN,aS,aT,aB,src,phi,nSweeps) {
    for (let sw = 0; sw < nSweeps; sw++)
      for (let kk = 1; kk < nz-1; kk++) for (let j = 1; j < ny-1; j++) for (let i = 1; i < nx-1; i++) {
        const ii = idx(i,j,kk); if (cellType[ii] === 1) continue; if (Math.abs(aP[ii]) < 1e-30) continue;
        phi[ii] = (src[ii] + aE[ii]*phi[idx(i+1,j,kk)] + aW[ii]*phi[idx(i-1,j,kk)] + aN[ii]*phi[idx(i,j+1,kk)] + aS[ii]*phi[idx(i,j-1,kk)] + aT[ii]*phi[idx(i,j,kk+1)] + aB[ii]*phi[idx(i,j,kk-1)]) / aP[ii];
      }
  }

  const aP = new Float64Array(N), aE = new Float64Array(N), aW = new Float64Array(N);
  const aN = new Float64Array(N), aS = new Float64Array(N), aT = new Float64Array(N), aB = new Float64Array(N);
  const src = new Float64Array(N);

  function assembleMomentum(vel, velComp, apStore) {
    aP.fill(0);aE.fill(0);aW.fill(0);aN.fill(0);aS.fill(0);aT.fill(0);aB.fill(0);src.fill(0);
    for (let kk=1;kk<nz-1;kk++) for (let j=1;j<ny-1;j++) for (let i=1;i<nx-1;i++) {
      const ii = idx(i,j,kk);
      if (cellType[ii] !== 0) { aP[ii]=1e30; src[ii]=0; continue; }
      const muEff = mu + nut[ii] * rho;
      const ibmPenalty = 0;
      const De=muEff*Ax/dx, Dn=muEff*Ay/dy, Dt=muEff*Az/dz;
      const Fe=rho*0.5*(u[ii]+u[idx(i+1,j,kk)])*Ax, Fw=rho*0.5*(u[ii]+u[idx(i-1,j,kk)])*Ax;
      const Fn=rho*0.5*(v[ii]+v[idx(i,j+1,kk)])*Ay, Fs=rho*0.5*(v[ii]+v[idx(i,j-1,kk)])*Ay;
      const Ft=rho*0.5*(w[ii]+w[idx(i,j,kk+1)])*Az, Fb=rho*0.5*(w[ii]+w[idx(i,j,kk-1)])*Az;
      aE[ii]=De+Math.max(-Fe,0); aW[ii]=De+Math.max(Fw,0);
      aN[ii]=Dn+Math.max(-Fn,0); aS[ii]=Dn+Math.max(Fs,0);
      aT[ii]=Dt+Math.max(-Ft,0); aB[ii]=Dt+Math.max(Fb,0);
      aP[ii]=aE[ii]+aW[ii]+aN[ii]+aS[ii]+aT[ii]+aB[ii]+(Fe-Fw)+(Fn-Fs)+(Ft-Fb)+ibmPenalty;
      if (velComp===0) src[ii]=(p[idx(i-1,j,kk)]-p[idx(i+1,j,kk)])*0.5*Ax;
      else if (velComp===1) src[ii]=(p[idx(i,j-1,kk)]-p[idx(i,j+1,kk)])*0.5*Ay;
      else src[ii]=(p[idx(i,j,kk-1)]-p[idx(i,j,kk+1)])*0.5*Az;
      aP[ii]/=alphaU; src[ii]+=(1-alphaU)*aP[ii]*vel[ii];
      apStore[ii]=aP[ii];
    }
    solveGS(aP,aE,aW,aN,aS,aT,aB,src,vel,15);
  }

  function assemblePressureCorrection() {
    aP.fill(0);aE.fill(0);aW.fill(0);aN.fill(0);aS.fill(0);aT.fill(0);aB.fill(0);src.fill(0);pp.fill(0);
    for (let kk=1;kk<nz-1;kk++) for (let j=1;j<ny-1;j++) for (let i=1;i<nx-1;i++) {
      const ii=idx(i,j,kk);
      if (cellType[ii]!==0) { aP[ii]=1e30; continue; }
      const de=(aP_u[idx(i+1,j,kk)]>1e-20)?Ax/(dx*aP_u[idx(i+1,j,kk)]):0;
      const dw=(aP_u[idx(i-1,j,kk)]>1e-20)?Ax/(dx*aP_u[idx(i-1,j,kk)]):0;
      const dn=(aP_v[idx(i,j+1,kk)]>1e-20)?Ay/(dy*aP_v[idx(i,j+1,kk)]):0;
      const ds=(aP_v[idx(i,j-1,kk)]>1e-20)?Ay/(dy*aP_v[idx(i,j-1,kk)]):0;
      const dt=(aP_w[idx(i,j,kk+1)]>1e-20)?Az/(dz*aP_w[idx(i,j,kk+1)]):0;
      const db=(aP_w[idx(i,j,kk-1)]>1e-20)?Az/(dz*aP_w[idx(i,j,kk-1)]):0;
      aE[ii]=rho*de*Ax; aW[ii]=rho*dw*Ax; aN[ii]=rho*dn*Ay; aS[ii]=rho*ds*Ay; aT[ii]=rho*dt*Az; aB[ii]=rho*db*Az;
      aP[ii]=aE[ii]+aW[ii]+aN[ii]+aS[ii]+aT[ii]+aB[ii]; if(aP[ii]<1e-20) aP[ii]=1e-20;
      const ue=0.5*(u[ii]+u[idx(i+1,j,kk)]),uw=0.5*(u[ii]+u[idx(i-1,j,kk)]);
      const vn=0.5*(v[ii]+v[idx(i,j+1,kk)]),vs=0.5*(v[ii]+v[idx(i,j-1,kk)]);
      const wt=0.5*(w[ii]+w[idx(i,j,kk+1)]),wb=0.5*(w[ii]+w[idx(i,j,kk-1)]);
      src[ii]=rho*((uw-ue)*Ax+(vs-vn)*Ay+(wb-wt)*Az);
    }
    aP[idx(1,1,1)]=1e30;
    solveGS(aP,aE,aW,aN,aS,aT,aB,src,pp,50);
  }

  function correctVelocityPressure() {
    for (let kk=1;kk<nz-1;kk++) for (let j=1;j<ny-1;j++) for (let i=1;i<nx-1;i++) {
      const ii=idx(i,j,kk); if(cellType[ii]===1)continue;
      if(aP_u[ii]>1e-20) u[ii]+=(pp[idx(i-1,j,kk)]-pp[idx(i+1,j,kk)])*0.5*Ax/(dx*aP_u[ii]);
      if(aP_v[ii]>1e-20) v[ii]+=(pp[idx(i,j-1,kk)]-pp[idx(i,j+1,kk)])*0.5*Ay/(dy*aP_v[ii]);
      if(aP_w[ii]>1e-20) w[ii]+=(pp[idx(i,j,kk-1)]-pp[idx(i,j,kk+1)])*0.5*Az/(dz*aP_w[ii]);
      p[ii]+=alphaP*pp[ii];
    }
    // Extrapolate pressure to solid/interface cells
    for(let kk=1;kk<nz-1;kk++) for(let j=1;j<ny-1;j++) for(let i=1;i<nx-1;i++) {
      const ii=idx(i,j,kk); if(cellType[ii]===0) continue;
      let sum=0,cnt=0;
      [idx(i+1,j,kk),idx(i-1,j,kk),idx(i,j+1,kk),idx(i,j-1,kk),idx(i,j,kk+1),idx(i,j,kk-1)].forEach(ni=>{if(cellType[ni]===0){sum+=p[ni];cnt++;}});
      if(cnt>0) p[ii]=sum/cnt;
    }
  }

  // Run SIMPLE loop
  for (let iter = 0; iter < maxIter; iter++) {
    assembleMomentum(u,0,aP_u); applyBC(u,'vel_u');
    assembleMomentum(v,1,aP_v); applyBC(v,'vel_v');
    assembleMomentum(w,2,aP_w); applyBC(w,'vel_w');
    assemblePressureCorrection(); correctVelocityPressure();
    applyBC(u,'vel_u'); applyBC(v,'vel_v'); applyBC(w,'vel_w'); applyBC(p,'p');
    if (true) {
      let nanU=0,nanP=0,maxU=0,maxP=0;
      for(let ii=0;ii<N;ii++){
        if(isNaN(u[ii]))nanU++;else maxU=Math.max(maxU,Math.abs(u[ii]));
        if(isNaN(p[ii]))nanP++;else maxP=Math.max(maxP,Math.abs(p[ii]));
      }
      if(config._debug) console.log(`  iter=${iter}: nanU=${nanU}, nanP=${nanP}, maxU=${maxU.toFixed(2)}, maxP=${maxP.toFixed(2)}`);
    }
  }
  return { u, v, w, p, idx };
}

// ==================== TESTS ====================
let passed = 0, failed = 0;
function pass(msg) { console.log('  \x1b[32mPASS\x1b[0m:', msg); passed++; }
function fail(msg) { console.log('  \x1b[31mFAIL\x1b[0m:', msg); failed++; }
function info(msg) { console.log('  \x1b[36m' + msg + '\x1b[0m'); }

console.log('\n=== CFD SIMPLE Solver Tests ===\n');

// Test 1: Empty Channel
console.log('--- Test 1: Empty Channel Flow ---');
{
  const nx=20,ny=10,nz=10,N=nx*ny*nz;
  const cellType = new Uint8Array(N);
  const t0 = Date.now();
  const res = createSolver({nx,ny,nz,dx:1,dy:1,dz:1,cellType,rho:1.225,mu:1.81e-5,Uin:10,dirAxis:0,dirSign:1,k_in:0.0375,eps_in:0.0036,maxIter:100,tol:1e-6});
  info('Solved in '+ ((Date.now()-t0)/1000).toFixed(1) +'s');
  const idx = res.idx;
  let maxUerr=0, maxV=0, maxW=0;
  for(let kk=2;kk<nz-2;kk++) for(let j=2;j<ny-2;j++) for(let i=2;i<nx-2;i++) {
    const ii=idx(i,j,kk);
    maxUerr=Math.max(maxUerr,Math.abs(res.u[ii]-10));
    maxV=Math.max(maxV,Math.abs(res.v[ii]));
    maxW=Math.max(maxW,Math.abs(res.w[ii]));
  }
  info('max|u-10|='+maxUerr.toFixed(4)+', max|v|='+maxV.toFixed(6)+', max|w|='+maxW.toFixed(6));
  if(maxUerr<1.0) pass('u within 1 m/s (err='+maxUerr.toFixed(3)+')'); else fail('u error='+maxUerr.toFixed(3));
  if(maxV<1.0) pass('v < 1 m/s ('+maxV.toFixed(4)+')'); else fail('v='+maxV.toFixed(4));
  if(maxW<1.0) pass('w < 1 m/s ('+maxW.toFixed(4)+')'); else fail('w='+maxW.toFixed(4));
}

// Test 2: Flow around block
console.log('\n--- Test 2: Flow Around Block ---');
{
  const nx=30,ny=15,nz=15,N=nx*ny*nz;
  const cellType = new Uint8Array(N);
  const idx=(i,j,k)=>i+j*nx+k*nx*ny;
  for(let kk=5;kk<10;kk++) for(let j=5;j<10;j++) for(let i=12;i<18;i++) cellType[idx(i,j,kk)]=1;
  for(let kk=4;kk<11;kk++) for(let j=4;j<11;j++) for(let i=11;i<19;i++) if(cellType[idx(i,j,kk)]===0) cellType[idx(i,j,kk)]=2;
  let sc=0,ic=0; for(let ii=0;ii<N;ii++){if(cellType[ii]===1)sc++;if(cellType[ii]===2)ic++;} info('Solid='+sc+', Interface='+ic);
  const t0 = Date.now();
  const res = createSolver({nx,ny,nz,dx:1,dy:1,dz:1,cellType,rho:1.225,mu:0.1,Uin:10,dirAxis:0,dirSign:1,k_in:0.0375,eps_in:0.0036,maxIter:80,tol:1e-6,_debug:true});
  info('Solved in '+((Date.now()-t0)/1000).toFixed(1)+'s');
  let maxUS=0;
  for(let kk=5;kk<10;kk++) for(let j=5;j<10;j++) for(let i=12;i<18;i++) maxUS=Math.max(maxUS,Math.abs(res.u[idx(i,j,kk)]));
  if(maxUS<0.01) pass('u=0 inside solid (max='+maxUS.toExponential(2)+')'); else fail('u solid='+maxUS.toFixed(3));
  // Debug: check for NaN/Inf in pressure
  let nanP=0,infP=0,maxAbsP=0;
  for(let ii=0;ii<N;ii++){if(isNaN(res.p[ii]))nanP++;if(!isFinite(res.p[ii]))infP++;else maxAbsP=Math.max(maxAbsP,Math.abs(res.p[ii]));}
  info('Pressure: NaN='+nanP+', Inf='+infP+', max|p|='+maxAbsP.toExponential(2));
  // Check sample cells
  info('p[3,7,7]='+res.p[idx(3,7,7)]+', p[10,7,7]='+res.p[idx(10,7,7)]+', p[19,7,7]='+res.p[idx(19,7,7)]);
  let pF=0,pB=0,pFr=0,cF=0,cB=0,cFr=0;
  for(let j=5;j<10;j++) for(let kk=5;kk<10;kk++){pF+=res.p[idx(10,j,kk)];cF++;pB+=res.p[idx(19,j,kk)];cB++;pFr+=res.p[idx(3,j,kk)];cFr++;}
  pF/=cF;pB/=cB;pFr/=cFr;
  info('p_front='+pF.toFixed(2)+', p_back='+pB.toFixed(2)+', p_free='+pFr.toFixed(2));
  if(pF>pFr) pass('Stagnation p > freestream'); else fail('Front pressure not elevated');
  if(pB<pF) pass('Wake p < front p'); else fail('Wake not lower');
}

// Test 3: Mass conservation
console.log('\n--- Test 3: Mass Conservation ---');
{
  const nx=20,ny=10,nz=10,N=nx*ny*nz;
  const cellType = new Uint8Array(N);
  const idx=(i,j,k)=>i+j*nx+k*nx*ny;
  const rho=1.225, Ax=1;
  const res = createSolver({nx,ny,nz,dx:1,dy:1,dz:1,cellType,rho,mu:1.81e-5,Uin:10,dirAxis:0,dirSign:1,k_in:0.0375,eps_in:0.0036,maxIter:100,tol:1e-6});
  let inF=0,outF=0;
  for(let j=1;j<ny-1;j++) for(let kk=1;kk<nz-1;kk++){inF+=rho*res.u[idx(1,j,kk)]*Ax;outF+=rho*res.u[idx(nx-2,j,kk)]*Ax;}
  const err=Math.abs(inF-outF)/(Math.abs(inF)+1e-30);
  info('Inlet='+inF.toFixed(2)+', Outlet='+outF.toFixed(2)+', Error='+(err*100).toFixed(2)+'%');
  if(err<0.05) pass('Mass conserved within 5%'); else fail('Mass error='+(err*100).toFixed(2)+'%');
}

console.log('\n=== Results: '+passed+' passed, '+failed+' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
