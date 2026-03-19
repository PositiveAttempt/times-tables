(function () {
    'use strict';

    // ── PNG ASSETS ────────────────────────────────────────────────────────────
    //
    //  assets/sea-far.png   — CW × 400 px, tileable vertically
    //  assets/sea-near.png  — CW × 400 px, tileable vertically
    //  assets/ship.png      — 48 × 64 px, top-down pointing up, transparent bg
    //
    // ─────────────────────────────────────────────────────────────────────────

    var panelEl, toggleEl, spmEl, genBarEl, lockBtn, shipEl, moneyEl, canvasEl, ctx;
    var secondarySlotEl = null;   // the purchaseable square in the loadout

    var gameOver = false;
    var gameOverEl = null;
    var correctCount = 0;
    var sessionStart = Date.now();
    var open = localStorage.getItem('idle_panel_open') === '1';
    var locked = localStorage.getItem('idle_locked') === '1';

    var MOBILE = window.innerWidth < 768;
    var SCALE = MOBILE ? 0.5 : 1;

    var PANEL_W = 216;
    var CANVAS_GAP = 50;
    var SHIP_W = 48 * SCALE;
    var SHIP_H = 64 * SCALE;
    var CH = window.innerHeight;
    var CW = Math.round(CH * (4 / 10));
    var cardLeft = 0;
    var SEA_TILE_H = 400;

    var imgFar = new Image();
    var imgNear = new Image();
    imgFar.src = 'assets/sea-far.png';
    imgNear.src = 'assets/sea-near.png';

    var lastRaf = performance.now();

    // ── flight ────────────────────────────────────────────────────────────────
    var flightState = 'grounded';
    var ship = { x: 0, y: 0, vx: 0, vy: 0, worldY: 0 };

    // ── generator ─────────────────────────────────────────────────────────────
    var GEN_MAX = 100;
    var gen = GEN_MAX;
    var GEN_AWARD = 28;
    var GEN_COST = 1.5;
    var GEN_IDLE = 0.8;
    var GEN_REGEN = 0.2;

    // ── weapon slots ──────────────────────────────────────────────────────────
    //
    //  PRIMARY   accepts: 'vulcan'   — always equipped, cannot be removed
    //  SECONDARY accepts: 'missile'  — empty by default, purchased with money
    //
    //  Set secondaryWeapon = null to leave the slot empty.
    //
    var PRIMARY_TYPES = { vulcan: true };
    var SECONDARY_TYPES = { missile: true };

    var MISSILE_PRICE = 50;   // cost to unlock the missile slot

    var primaryWeapon = { type: 'vulcan' };
    var secondaryWeapon = null;   // starts empty — buy it in the panel

    // ── projectiles ───────────────────────────────────────────────────────────
    var bullets = [];
    var missiles = [];

    // ── money ─────────────────────────────────────────────────────────────────
    var money = parseInt(localStorage.getItem('idle_money') || '0', 10);
    var MONEY_PER_KILL = 5;

    // ── shields / armour ──────────────────────────────────────────────────────
    var SHIELD_MAX = 80;
    var ARMOUR_MAX = 20;
    var shields = SHIELD_MAX;
    var armour = ARMOUR_MAX;
    var SHIELD_REGEN = 12;
    var armourBarEl;

    // ── enemies ───────────────────────────────────────────────────────────────
    var enemies = [];
    var enemyBullets = [];
    var ENEMY_FIRE_RATE = 1.8;
    var obstacles = [];
    var lastFireMs = 0;
    var enemyRespawnTimer = 0;

    // ── wave system ───────────────────────────────────────────────────────────
    var waves = [
        { label: 'trickle', duration: 14, gap: 3.5, enemyHp: 3, enemyVy: 70 },
        { label: 'swarm', duration: 10, gap: 1.2, enemyHp: 2, enemyVy: 90 },
        { label: 'silence', duration: 5, gap: 999, enemyHp: 3, enemyVy: 70 },
        { label: 'swarm', duration: 12, gap: 0.8, enemyHp: 2, enemyVy: 110 },
        { label: 'silence', duration: 4, gap: 999, enemyHp: 3, enemyVy: 70 },
        { label: 'heavy', duration: 15, gap: 2.2, enemyHp: 5, enemyVy: 55 },
        { label: 'silence', duration: 6, gap: 999, enemyHp: 3, enemyVy: 70 },
        { label: 'climax', duration: 10, gap: 0.5, enemyHp: 2, enemyVy: 130 },
        { label: 'silence', duration: 8, gap: 999, enemyHp: 3, enemyVy: 70 },
    ];
    var waveIndex = 0;
    var waveTimer = 0;

    function updateWave(dt) {
        var w = waves[waveIndex];
        enemyRespawnTimer -= dt;
        if (enemyRespawnTimer <= 0 && w.label !== 'silence' && enemies.length < 6) {
            spawnEnemyWave(w);
            enemyRespawnTimer = w.gap + Math.random() * 0.4;
        }
        waveTimer += dt;
        if (waveTimer >= w.duration) {
            waveTimer = 0;
            waveIndex = (waveIndex + 1) % waves.length;
            enemyRespawnTimer = waves[waveIndex].gap * 0.5;
        }
    }

    function spawnEnemyWave(w) {
        var el = makeEnemyEl(w.enemyHp > 4 ? 2 : 1);
        enemies.push({
            el: el,
            x: CW * 0.2 + Math.random() * CW * 0.6,
            y: -SHIP_H,
            hp: w.enemyHp,
            maxHp: w.enemyHp,
            vy: w.enemyVy + scrollSpeed() * 0.25,
            phase: Math.random() * Math.PI * 2,
            flash: 0,
            lastFireMs: 0,
            hw: 16 * 1.5,
            hh: 16 * 1.5,
        });
    }

    var burnFrame = 0;
    var burnTimer = 0;
    var BURN_INTERVAL = 0.56;

    // ── canvas positioning ────────────────────────────────────────────────────
    function positionCanvas() {
        var card = document.querySelector('.card');
        if (!card) {
            cardLeft = 0;
            CW = window.innerWidth;
        } else {
            var rect = card.getBoundingClientRect();
            cardLeft = Math.round(rect.left);
            CW = Math.round(rect.width);
        }
        canvasEl.style.left = cardLeft + 'px';
        canvasEl.style.right = '';
        canvasEl.style.width = CW + 'px';
        canvasEl.width = CW;
        canvasEl.height = CH;
    }

    function updateShipDom() {
        if (!shipEl) return;
        shipEl.style.left = Math.round(cardLeft + ship.x - SHIP_W / 2) + 'px';
        shipEl.style.right = '';
        shipEl.style.top = Math.round(ship.y - SHIP_H / 2) + 'px';
    }

    function updateEnemyDom() {
        var dark = document.documentElement.classList.contains('dark');
        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            e.el.style.left = Math.round(cardLeft + e.x - SHIP_W / 2) + 'px';
            e.el.style.top = Math.round(e.y - SHIP_H / 2) + 'px';
            e.el.style.filter = e.flash > 0
                ? (dark ? 'invert(1) brightness(2)' : 'brightness(2)')
                : (dark ? 'invert(1)' : 'none');
            e.el.style.display = 'block';
        }
    }

    // ── scroll speed ──────────────────────────────────────────────────────────
    function scrollSpeed() {
        if (flightState === 'grounded') return 0;
        var spm = parseFloat(getSPM()) || 0;
        return 5 + Math.min(spm * 20, 150);
    }

    // ── enemy spawn ───────────────────────────────────────────────────────────
    function spawnEnemy() {
        var type = Math.random() < 0.75 ? 1 : 2;
        var el = makeEnemyEl(type);
        enemies.push({
            el: el,
            x: CW * 0.2 + Math.random() * CW * 0.6,
            y: -SHIP_H,
            hp: type === 1 ? 3 : 9,
            maxHp: type === 1 ? 3 : 9,
            vy: 70 + scrollSpeed() * 0.25,
            phase: Math.random() * Math.PI * 2,
            flash: 0,
            lastFireMs: 0,
            hw: SHIP_W * 1.5,
            hh: SHIP_H * 1.5,
        });
    }

    window._spawnEnemy = spawnEnemy;

    function spawnLevel() {
        obstacles = [];
        bullets = [];
        missiles = [];
    }

    // ── steering ──────────────────────────────────────────────────────────────
    function steer(dt) {
        if (flightState === 'grounded' || flightState === 'ignition') return;

        if (flightState === 'cruising') {
            var spd = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
            if (spd > 20) {
                burnTimer += dt;
                if (burnTimer >= BURN_INTERVAL) {
                    burnTimer = 0;
                    burnFrame = 1 - burnFrame;
                    shipEl.src = burnFrame === 0 ? 'assets/ship-cruise.png' : 'assets/ship-cruise2.png';
                }
            } else {
                shipEl.src = 'assets/ship-cruise.png';
                burnFrame = 0;
            }
        }

        var fx = 0, fy = 0;
        var target = null;
        for (var i = 0; i < enemies.length; i++) {
            if (!target || enemies[i].y > target.y) target = enemies[i];
        }
        if (target) {
            var leadTime = 0.7;
            var predictedX = target.x + Math.sin(target.phase + leadTime * 0.5) * 18 * leadTime;
            fx += (predictedX - ship.x) * 18.0;
            fy += ((MOBILE ? CH * 0.325 : CH * 0.75) - ship.y) * 1.8;
        } else {
            fx += (CW * 0.5 - ship.x) * 0.9;
            fy += ((MOBILE ? CH * 0.35 : CH * 0.75) - ship.y) * 1.8;
        }

        var m = 38 * SCALE;
        if (ship.x < m) fx += (m - ship.x) * 4;
        if (ship.x > CW - m) fx += (CW - m - ship.x) * 4;
        if (ship.y < m) fy += (m - ship.y) * 4;
        if (ship.y > CH - m) fy += (CH - m - ship.y) * 4;

        var damp = 0.86;
        ship.vx = (ship.vx + fx * dt) * damp;
        ship.vy = (ship.vy + fy * dt) * damp;

        var spd = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
        var maxSpd = 155;
        if (spd > maxSpd) { ship.vx *= maxSpd / spd; ship.vy *= maxSpd / spd; }

        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;
    }

    // ── fire rate ─────────────────────────────────────────────────────────────
    function fireRate() {
        var spm = parseFloat(getSPM()) || 0;
        return Math.min(0.6 + spm * 0.22, 7);
    }

    // ── primary weapon: vulcan ────────────────────────────────────────────────
    function tryFirePrimary(now) {
        if (!primaryWeapon) return;
        if (!PRIMARY_TYPES[primaryWeapon.type]) return;
        if (primaryWeapon.type !== 'vulcan') return;
        if (!enemies.length || gen <= 0) return;
        if (now - lastFireMs < 1000 / fireRate()) return;

        var best = null;
        for (var i = 0; i < enemies.length; i++) {
            if (Math.abs(ship.x - enemies[i].x) <= 36) {
                if (!best || enemies[i].y > best.y) best = enemies[i];
            }
        }
        if (!best) return;

        var timeToTarget = (ship.y - best.y) / 385;
        var predictedX = best.x + Math.sin(best.phase + timeToTarget * 0.5) * 18 * timeToTarget;
        var vx = (predictedX - ship.x) / timeToTarget;
        bullets.push({ x: ship.x, y: ship.y - SHIP_H * 0.45, vx: vx, vy: -385 });
        gen = Math.max(0, gen - GEN_COST);
        lastFireMs = now;
    }

    // ── secondary weapon: missile ─────────────────────────────────────────────
    function tryFireSecondary(now) {
        if (!secondaryWeapon) return;
        if (!SECONDARY_TYPES[secondaryWeapon.type]) return;
        if (secondaryWeapon.type !== 'missile') return;
        if (!enemies.length || gen <= 0) return;
        if (flightState !== 'cruising') return;

        secondaryWeapon.timer -= (now - (secondaryWeapon._last || now)) / 1000;
        secondaryWeapon._last = now;
        if (secondaryWeapon.timer > 0) return;

        var target = null;
        for (var i = 0; i < enemies.length; i++) {
            if (!target || enemies[i].y > target.y) target = enemies[i];
        }
        if (!target) return;

        var offsets = [-10, 10];
        for (var o = 0; o < offsets.length; o++) {
            var dx = target.x - ship.x;
            var dy = target.y - ship.y;
            var launchAngle = Math.atan2(dy, dx);

            missiles.push({
                x: ship.x + offsets[o] * SCALE,
                y: ship.y - SHIP_H * 0.3,
                vx: 0,
                vy: 0,
                target: target,
                phase: 'eject',
                age: 0,
                angle: launchAngle,
                ejectOffset: offsets[o],
                launchDelay: o * 0.05,
                trail: [],
            });
        }

        secondaryWeapon.timer = secondaryWeapon.cooldown;
        gen = Math.max(0, gen - GEN_COST * 4);
    }

    // ── missile physics ───────────────────────────────────────────────────────
    function updateMissiles(dt) {
        for (var i = missiles.length - 1; i >= 0; i--) {
            var m = missiles[i];
            m.age += dt;

            m.trail.push({ x: m.x, y: m.y, age: 0 });
            for (var t = m.trail.length - 1; t >= 0; t--) {
                m.trail[t].age += dt;
                if (m.trail[t].age > 0.35) m.trail.splice(t, 1);
            }

            if (m.launchDelay > 0) {
                m.launchDelay -= dt;
                continue;
            }

            if (m.phase === 'eject') {
                var ejectSpd = 28 * SCALE;
                m.x += (m.ejectOffset > 0 ? 1 : -1) * ejectSpd * dt;
                m.y += -8 * SCALE * dt;
                if (m.target && m.target.hp > 0) {
                    m.angle = Math.atan2(m.target.y - m.y, m.target.x - m.x);
                }
                if (m.age > 0.15) { m.phase = 'hang'; m.age = 0; }

            } else if (m.phase === 'hang') {
                m.x += (m.ejectOffset > 0 ? 1 : -1) * 4 * SCALE * dt;
                m.y += 2 * SCALE * dt;
                if (m.target && m.target.hp > 0) {
                    m.angle = Math.atan2(m.target.y - m.y, m.target.x - m.x);
                }
                if (m.age > 0.12) { m.phase = 'lock'; m.age = 0; }

            } else if (m.phase === 'lock') {
                var spd = Math.min(60 + m.age * 100, 620);

                if (!m.target || m.target.hp <= 0) {
                    // target gone — commit to last angle, fly straight
                    m.x += Math.cos(m.angle) * spd * dt;
                    m.y += Math.sin(m.angle) * spd * dt;
                } else {
                    var tx = m.target.x;
                    var ty = m.target.y;
                    var ddx = tx - m.x;
                    var ddy = ty - m.y;
                    var targetAngle = Math.atan2(ddy, ddx);
                    var da = targetAngle - m.angle;
                    while (da > Math.PI) da -= Math.PI * 2;
                    while (da < -Math.PI) da += Math.PI * 2;
                    m.angle += da * Math.min(6 * dt * 8, 1);
                    m.vx = Math.cos(m.angle) * spd;
                    m.vy = Math.sin(m.angle) * spd;
                    m.x += m.vx * dt;
                    m.y += m.vy * dt;
                }
            }

            if (m.y < -80 || m.y > CH + 80 || m.x < -80 || m.x > CW + 80) {
                missiles.splice(i, 1);
                continue;
            }

            var hit = false;
            for (var j = enemies.length - 1; j >= 0; j--) {
                var e = enemies[j];
                var hdx = m.x - e.x;
                var hdy = m.y - e.y;
                if (Math.abs(hdx) < 22 * SCALE && Math.abs(hdy) < 22 * SCALE) {
                    e.hp -= 3;
                    e.flash = 0.2;
                    if (e.hp <= 0) {
                        var streakMult = 1 + (window.streak || 0) * 0.1;
                        var earned = Math.round(MONEY_PER_KILL * streakMult);
                        money += earned;
                        localStorage.setItem('idle_money', money);
                        if (moneyEl) moneyEl.textContent = money;
                        if (open || locked) spawnKillFloat(e.x, e.y, earned);
                        e.el.remove();
                        enemies.splice(j, 1);
                    }
                    hit = true;
                    break;
                }
            }
            if (hit) { missiles.splice(i, 1); continue; }
        }
    }

    // ── enemy fire ────────────────────────────────────────────────────────────
    function tryEnemyFire(now) {
        if (flightState !== 'cruising') return;
        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (!e.lastFireMs) e.lastFireMs = now;
            if ((now - e.lastFireMs) / 1000 < ENEMY_FIRE_RATE) continue;
            enemyBullets.push({ x: e.x, y: e.y + SHIP_H * 0.45, vy: 320 });
            e.lastFireMs = now;
        }
    }

    // ── combat update ─────────────────────────────────────────────────────────
    function updateCombat(now, dt) {
        if (gameOver) return;
        if (flightState === 'grounded' || flightState === 'ignition') return;

        gen = Math.min(GEN_MAX, Math.max(0, gen - GEN_IDLE * dt + GEN_REGEN * dt));

        var regenRate = SHIELD_REGEN * (gen / GEN_MAX);
        shields = Math.min(SHIELD_MAX, shields + regenRate * dt);

        tryFirePrimary(now);
        tryFireSecondary(now);
        tryEnemyFire(now);

        for (var i = bullets.length - 1; i >= 0; i--) {
            bullets[i].x += (bullets[i].vx || 0) * dt;
            bullets[i].y += bullets[i].vy * dt;
            if (bullets[i].y < -12) bullets.splice(i, 1);
        }

        for (var i = enemyBullets.length - 1; i >= 0; i--) {
            enemyBullets[i].y += enemyBullets[i].vy * dt;
            if (enemyBullets[i].y > CH + 12) {
                enemyBullets.splice(i, 1);
                continue;
            }
            var dx = enemyBullets[i].x - ship.x;
            var dy = enemyBullets[i].y - ship.y;
            if (Math.abs(dx) < 18 * SCALE && Math.abs(dy) < 18 * SCALE) {
                takeDamage(10);
                enemyBullets.splice(i, 1);
            }
        }

        for (var i = enemies.length - 1; i >= 0; i--) {
            var e = enemies[i];
            e.y += e.vy * dt;
            e.phase += dt * 0.5;
            e.x += Math.sin(e.phase) * 18 * dt;
            e.x = Math.max(CW * 0.1, Math.min(CW * 0.9, e.x));
            if (e.flash > 0) e.flash -= dt;

            if (e.y > CH + SHIP_H) {
                e.el.remove();
                enemies.splice(i, 1);
                continue;
            }

            for (var j = bullets.length - 1; j >= 0; j--) {
                var dx = bullets[j].x - e.x;
                var dy = bullets[j].y - e.y;
                if (Math.abs(dx) < 20 * SCALE && Math.abs(dy) < 20 * SCALE) {
                    e.hp--;
                    e.flash = 0.14;
                    bullets.splice(j, 1);
                    if (e.hp <= 0) {
                        var streakMult = 1 + (window.streak || 0) * 0.1;
                        var earned = Math.round(MONEY_PER_KILL * streakMult);
                        money += earned;
                        localStorage.setItem('idle_money', money);
                        if (moneyEl) moneyEl.textContent = money;
                        if (open || locked) spawnKillFloat(e.x, e.y, earned);
                        e.el.remove();
                        enemies.splice(i, 1);
                        break;
                    }
                }
            }
        }

        updateMissiles(dt);
        updateWave(dt);
    }

    // ── draw ──────────────────────────────────────────────────────────────────
    function drawSeaFar() {
        if (!imgFar.complete || !imgFar.naturalWidth) return;
        var cameraTop = ship.worldY - CH * 0.75;
        var nearScreenY = Math.round(-cameraTop);
        var clipH = nearScreenY > 0 ? Math.min(nearScreenY, CH) : CH;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, CW, clipH);
        ctx.clip();
        var offset = cameraTop * 0.45;
        var startY = -(offset % SEA_TILE_H);
        if (startY > 0) startY -= SEA_TILE_H;
        for (var y = startY; y < clipH; y += SEA_TILE_H) {
            ctx.drawImage(imgFar, 0, y, CW, SEA_TILE_H);
        }
        ctx.restore();
    }

    function drawSeaNear() {
        if (!imgNear.complete || !imgNear.naturalWidth) return;
        var cameraTop = ship.worldY - CH * 0.75;
        var screenY = Math.round(-cameraTop);
        if (screenY >= CH || screenY + SEA_TILE_H <= 0) return;
        ctx.drawImage(imgNear, 0, screenY, CW, SEA_TILE_H);
    }

    function drawCombat() {
        if (flightState === 'grounded') return;
        var dark = document.documentElement.classList.contains('dark');

        // primary bullets
        ctx.fillStyle = dark ? 'rgba(200,196,188,0.9)' : 'rgba(26,25,22,0.85)';
        for (var i = 0; i < bullets.length; i++) {
            ctx.fillRect(bullets[i].x - 1.5 * SCALE, bullets[i].y - 5 * SCALE, 3 * SCALE, 9 * SCALE);
        }

        // enemy bullets
        ctx.fillStyle = dark ? 'rgba(200,196,188,0.5)' : 'rgba(26,25,22,0.45)';
        for (var i = 0; i < enemyBullets.length; i++) {
            ctx.fillRect(enemyBullets[i].x - 2 * SCALE, enemyBullets[i].y - 5 * SCALE, 4 * SCALE, 9 * SCALE);
        }

        // missiles
        for (var i = 0; i < missiles.length; i++) {
            var m = missiles[i];

            for (var t = 0; t < m.trail.length; t++) {
                var tf = 1 - (m.trail[t].age / 0.35);
                ctx.globalAlpha = tf * (m.phase === 'lock' ? 0.55 : 0.18);
                var ts = (m.phase === 'lock' ? 2.5 : 1.5) * tf * SCALE;
                ctx.fillStyle = dark ? '#c8c4bc' : '#1a1916';
                ctx.beginPath();
                ctx.arc(m.trail[t].x, m.trail[t].y, ts, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            ctx.save();
            ctx.translate(m.x, m.y);
            ctx.rotate(m.angle + Math.PI / 2);
            ctx.globalAlpha = m.phase === 'eject' ? 0.5 : m.phase === 'hang' ? 0.65 : 0.85;
            ctx.fillStyle = dark ? '#c8c4bc' : '#1a1916';

            var bw = 2 * SCALE, bh = 7 * SCALE;
            ctx.fillRect(-bw / 2, -bh, bw, bh + 4 * SCALE);

            ctx.beginPath();
            ctx.moveTo(-bw / 2, -bh);
            ctx.lineTo(0, -bh - 5 * SCALE);
            ctx.lineTo(bw / 2, -bh);
            ctx.fill();

            if (m.phase === 'lock') {
                ctx.globalAlpha = 0.4 + Math.random() * 0.3;
                ctx.fillStyle = dark ? '#e8e4dc' : '#6a6660';
                ctx.fillRect(-bw / 2, 4 * SCALE, bw, (3 + Math.random() * 4) * SCALE);
            }

            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    // ── bars ──────────────────────────────────────────────────────────────────
    function updateGenBar() {
        if (!genBarEl) return;
        genBarEl.style.width = Math.max(0, (gen / GEN_MAX) * 100) + '%';
    }

    function updateArmourBar() {
        if (!armourBarEl) return;
        var total = SHIELD_MAX + ARMOUR_MAX;
        var filled = ((shields + armour) / total) * 100;
        var shieldFraction = shields / (shields + armour + 0.001);
        armourBarEl.style.width = Math.max(0, filled) + '%';
        var dark = document.documentElement.classList.contains('dark');
        armourBarEl.style.background = shieldFraction > 0.05
            ? (dark ? '#c8c4bc' : '#1a1916')
            : '#8a4a3a';
    }

    function takeDamage(amount) {
        if (gameOver) return;
        var overflow = Math.max(0, amount - shields);
        shields = Math.max(0, shields - amount);
        if (overflow > 0) {
            armour = Math.max(0, armour - overflow);
            if (armour <= 0) triggerGameOver();
        }
    }

    // ── loadout purchase ──────────────────────────────────────────────────────
    function buyMissile() {
        if (secondaryWeapon) return;
        if (money < MISSILE_PRICE) return;
        money -= MISSILE_PRICE;
        localStorage.setItem('idle_money', money);
        localStorage.setItem('idle_missile_unlocked', '1');
        if (moneyEl) moneyEl.textContent = money;
        secondaryWeapon = { type: 'missile', cooldown: 4.5, timer: 0, _last: 0 };
        updateSecondarySlotEl();
    }

    function updateSecondarySlotEl() {
        if (!secondarySlotEl) return;
        if (secondaryWeapon) {
            secondarySlotEl.textContent = 'M';
            secondarySlotEl.classList.add('filled');
            secondarySlotEl.title = '';
        } else {
            // show price if affordable, dash if not
            secondarySlotEl.textContent = money >= MISSILE_PRICE ? MISSILE_PRICE : '\u2013';
            secondarySlotEl.classList.remove('filled');
            secondarySlotEl.title = money >= MISSILE_PRICE ? 'Buy missile' : 'Need ' + MISSILE_PRICE;
        }
    }

    // ── RAF loop ──────────────────────────────────────────────────────────────
    function rafLoop(now) {
        var dt = Math.min((now - lastRaf) / 1000, 0.1);
        lastRaf = now;

        var spd = scrollSpeed();
        if (flightState !== 'grounded') ship.worldY -= spd * dt;

        steer(dt);
        updateCombat(now, dt);

        if (open || locked) {
            ctx.clearRect(0, 0, CW, CH);
            drawSeaFar();
            drawSeaNear();
            drawCombat();
            updateShipDom();
            updateEnemyDom();
            updateGenBar();
            updateArmourBar();
            updateSecondarySlotEl();   // keep price live as money changes
        }

        if (open) updateUI();

        requestAnimationFrame(rafLoop);
    }

    // ── styles ────────────────────────────────────────────────────────────────
    function injectStyles() {
        document.documentElement.style.setProperty('--idle-panel-w', (MOBILE ? 140 : 216) + 'px');
        document.documentElement.style.setProperty('--idle-ship-w', (48 * SCALE) + 'px');

        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'idle.css';
        document.head.appendChild(link);

        var s = document.createElement('style');
        s.textContent = [
            '#idle-loadout-label{font-size:10px;text-transform:uppercase;letter-spacing:.16em;',
            'color:#1a1916;margin-top:14px;margin-bottom:8px;}',
            'html.dark #idle-loadout-label{color:#e0dcd6;}',

            '#idle-loadout-slots{display:flex;gap:6px;}',

            '.idle-slot{',
            'width:32px;height:32px;',
            'border:0.5px solid #c8c4bc;',
            'display:flex;align-items:center;justify-content:center;',
            'font-family:"EB Garamond","Times New Roman",serif;',
            'font-size:13px;letter-spacing:.06em;',
            'color:#1a1916;',
            'user-select:none;',
            'transition:border-color .15s,color .15s,opacity .15s;',
            '}',

            '.idle-slot.primary{opacity:0.9;cursor:default;}',

            '.idle-slot.secondary{opacity:0.35;cursor:pointer;}',
            '.idle-slot.secondary:hover{border-color:#8a8680;opacity:0.55;}',
            '.idle-slot.secondary.filled{opacity:0.9;cursor:default;}',
            '.idle-slot.secondary.filled:hover{border-color:#c8c4bc;}',

            'html.dark .idle-slot{border-color:#2e3038;color:#c8c4bc;}',
            'html.dark .idle-slot.secondary:hover{border-color:#6a6660;}',
        ].join('');
        document.head.appendChild(s);
    }

    // ── DOM ───────────────────────────────────────────────────────────────────
    function buildCanvas() {
        canvasEl = document.createElement('canvas');
        canvasEl.id = 'idle-canvas';
        ctx = canvasEl.getContext('2d');
        document.body.appendChild(canvasEl);
        if (open || locked) canvasEl.classList.add('on');
    }

    function buildShip() {
        shipEl = document.createElement('img');
        shipEl.id = 'idle-ship';
        shipEl.src = 'assets/ship.png';
        document.body.appendChild(shipEl);
        if (open || locked) shipEl.classList.add('on');
    }

    function makeEnemyEl(type) {
        var el = document.createElement('img');
        el.className = 'idle-enemy';
        el.src = type === 2 ? 'assets/enemy2.png' : 'assets/enemy1.png';
        document.body.appendChild(el);
        if (open || locked) el.classList.add('on');
        return el;
    }

    function buildLoadoutSlots(parent) {
        var label = document.createElement('div');
        label.id = 'idle-loadout-label';
        label.textContent = 'loadout';
        parent.appendChild(label);

        var row = document.createElement('div');
        row.id = 'idle-loadout-slots';

        function attachTooltip(el, getText) {
            el.addEventListener('mouseenter', function (ev) {
                var t = document.getElementById('idle-tooltip');
                if (!t) return;
                t.textContent = getText();
                t.classList.add('on');
                positionTooltip(t, el);
            });
            el.addEventListener('mousemove', function (ev) {
                var t = document.getElementById('idle-tooltip');
                if (!t) return;
                positionTooltip(t, el);
            });
            el.addEventListener('mouseleave', function () {
                var t = document.getElementById('idle-tooltip');
                if (t) t.classList.remove('on');
            });
        }

        function positionTooltip(t, el) {
            var r = el.getBoundingClientRect();
            t.style.left = Math.round(r.left) + 'px';
            t.style.top = Math.round(r.bottom + 6) + 'px';
        }

        var primarySlot = document.createElement('div');
        primarySlot.className = 'idle-slot primary';
        primarySlot.textContent = 'V';
        attachTooltip(primarySlot, function () { return 'Slot 1: Vulcan'; });
        row.appendChild(primarySlot);

        secondarySlotEl = document.createElement('div');
        secondarySlotEl.className = 'idle-slot secondary';
        secondarySlotEl.addEventListener('click', function () {
            if (!secondaryWeapon) buyMissile();
        });
        attachTooltip(secondarySlotEl, function () {
            if (secondaryWeapon) return 'Slot 2: Missile';
            if (money >= MISSILE_PRICE) return 'Slot 2: Buy for ' + MISSILE_PRICE;
            return 'Slot 2 \u2014 ' + MISSILE_PRICE + ' required';
        });
        updateSecondarySlotEl();
        row.appendChild(secondarySlotEl);

        parent.appendChild(row);
    }

    function buildDOM() {
        injectStyles();
        buildCanvas();
        buildShip();
        positionCanvas();

        ship.x = CW / 2;
        ship.y = CH * 0.80;
        ship.worldY = CH * 0.2;
        updateShipDom();

        if (MOBILE) {
            var topbarStats = document.createElement('div');
            topbarStats.id = 'idle-topbar-stats';
            topbarStats.style.display = open ? 'flex' : 'none';

            var topbarGenTrack = document.createElement('div');
            topbarGenTrack.id = 'idle-topbar-gen-track';
            genBarEl = document.createElement('div');
            genBarEl.id = 'idle-topbar-gen-bar';
            topbarGenTrack.appendChild(genBarEl);
            topbarStats.appendChild(topbarGenTrack);

            moneyEl = document.createElement('div');
            moneyEl.id = 'idle-topbar-money';
            moneyEl.textContent = money;
            topbarStats.appendChild(moneyEl);

            var topbarDark = document.getElementById('topbar-dark');
            if (topbarDark && topbarDark.parentNode) {
                topbarDark.parentNode.insertBefore(topbarStats, topbarDark);
            }

            toggleEl = document.createElement('button');
            toggleEl.id = 'idle-toggle';
            toggleEl.setAttribute('aria-label', 'idle');
            toggleEl.textContent = open ? '\u25c9' : '\u25cf';
            toggleEl.style.bottom = '88px';
            toggleEl.style.right = '14px';
            toggleEl.classList.toggle('on', open);
            toggleEl.addEventListener('click', function () {
                open = !open;
                setVisible(open);
                topbarStats.style.display = open ? 'flex' : 'none';
                toggleEl.textContent = open ? '\u25c9' : '\u25cf';
                localStorage.setItem('idle_panel_open', open ? '1' : '0');
                toggleEl.classList.toggle('on', open);
            });
            document.body.appendChild(toggleEl);

        } else {
            toggleEl = document.createElement('button');
            toggleEl.id = 'idle-toggle';
            toggleEl.setAttribute('aria-label', 'idle');
            toggleEl.addEventListener('click', togglePanel);
            toggleEl.textContent = locked ? '\u25c9' : '\u25cf';
            toggleEl.classList.toggle('locked', locked);
            document.body.appendChild(toggleEl);

            panelEl = document.createElement('div');
            panelEl.id = 'idle-panel';

            spmEl = document.createElement('div');
            spmEl.id = 'idle-spm';
            panelEl.appendChild(spmEl);

            var moneyLabel = document.createElement('div');
            moneyLabel.id = 'idle-money-label';
            moneyLabel.textContent = 'money';
            panelEl.appendChild(moneyLabel);

            moneyEl = document.createElement('div');
            moneyEl.id = 'idle-money';
            moneyEl.textContent = money;
            panelEl.appendChild(moneyEl);

            var genLabel = document.createElement('div');
            genLabel.id = 'idle-gen-label';
            genLabel.textContent = 'ϟ gen';
            panelEl.appendChild(genLabel);

            var genTrack = document.createElement('div');
            genTrack.id = 'idle-gen-track';
            genBarEl = document.createElement('div');
            genBarEl.id = 'idle-gen-bar';
            genTrack.appendChild(genBarEl);
            panelEl.appendChild(genTrack);

            var armourLabel = document.createElement('div');
            armourLabel.id = 'idle-armour-label';
            armourLabel.textContent = '⛨ Shields';
            panelEl.appendChild(armourLabel);

            var armourTrack = document.createElement('div');
            armourTrack.id = 'idle-armour-track';
            armourBarEl = document.createElement('div');
            armourBarEl.id = 'idle-armour-bar';
            armourTrack.appendChild(armourBarEl);
            panelEl.appendChild(armourTrack);

            var tooltipEl = document.createElement('div');
            tooltipEl.id = 'idle-tooltip';
            document.body.appendChild(tooltipEl);

            // ── loadout slots — under shields ──────────────────────────────
            buildLoadoutSlots(panelEl);

            lockBtn = document.createElement('button');
            lockBtn.id = 'idle-lock';
            lockBtn.textContent = locked ? 'Unpin view' : 'Pin view';
            lockBtn.classList.toggle('on', locked);
            lockBtn.addEventListener('click', toggleLock);

            var resetBtn = document.createElement('button');
            resetBtn.id = 'idle-reset';
            resetBtn.textContent = '↺';
            resetBtn.title = 'Reset progress';
            resetBtn.addEventListener('click', function () {
                if (confirm('Reset all progress?')) {
                    localStorage.clear();
                    location.reload();
                }
            });

            var lockRow = document.createElement('div');
            lockRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:auto;';
            lockRow.appendChild(lockBtn);
            lockRow.appendChild(resetBtn);
            panelEl.appendChild(lockRow);

            document.body.appendChild(panelEl);
            panelEl.classList.toggle('on', open);
            toggleEl.classList.toggle('on', open);
        }
    }

    // ── visibility ────────────────────────────────────────────────────────────
    function setVisible(v) {
        canvasEl.classList.toggle('on', v);
        shipEl.classList.toggle('on', v);
        for (var i = 0; i < enemies.length; i++) {
            enemies[i].el.classList.toggle('on', v);
        }
    }

    function togglePanel() {
        open = !open;
        panelEl.classList.toggle('on', open);
        toggleEl.classList.toggle('on', open);
        setVisible(open || locked);
        localStorage.setItem('idle_panel_open', open ? '1' : '0');
    }

    function toggleLock() {
        locked = !locked;
        lockBtn.textContent = locked ? 'Unpin view' : 'Pin view';
        lockBtn.classList.toggle('on', locked);
        toggleEl.textContent = locked ? '\u25c9' : '\u25cf';
        toggleEl.classList.toggle('locked', locked);
        setVisible(open || locked);
        localStorage.setItem('idle_locked', locked ? '1' : '0');
    }

    // ── floats ────────────────────────────────────────────────────────────────
    function spawnEnergyFloat() {
        var q = document.getElementById('question');
        var x, y;
        if (q) {
            var r = q.getBoundingClientRect();
            x = r.left + r.width / 2 - 20;
            y = r.top;
        } else {
            x = window.innerWidth / 2;
            y = window.innerHeight * 0.4;
        }
        var el = document.createElement('span');
        el.className = 'idle-float';
        el.textContent = '\u2042' + GEN_AWARD;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        document.body.appendChild(el);
        el.addEventListener('animationend', function () { el.remove(); });
    }

    function spawnKillFloat(canvasX, canvasY, amount) {
        var el = document.createElement('span');
        el.className = 'idle-float-kill';
        el.textContent = '+' + amount;
        el.style.left = Math.round(cardLeft + canvasX - 16) + 'px';
        el.style.top = Math.round(canvasY) + 'px';
        document.body.appendChild(el);
        el.addEventListener('animationend', function () { el.remove(); });
    }

    function getSPM() {
        var mins = (Date.now() - sessionStart) / 60000;
        if (mins < 0.1) return '0.0';
        return (correctCount / mins).toFixed(1);
    }

    function takeoff() {
        if (flightState === 'grounded') {
            flightState = 'ignition';
            shipEl.src = 'assets/ship-burn.png';
            return;
        }
        if (flightState === 'ignition') {
            flightState = 'cruising';
            shipEl.src = 'assets/ship-cruise.png';
        }
    }

    function award(n) {
        correctCount++;
        gen = Math.min(GEN_MAX, gen + GEN_AWARD);
        takeoff();
        if (open || locked) spawnEnergyFloat();
    }

    function resetGame() {
        gameOver = false;
        shields = SHIELD_MAX;
        armour = ARMOUR_MAX;
        gen = GEN_MAX;
        for (var i = 0; i < enemies.length; i++) enemies[i].el.remove();
        enemies = [];
        bullets = [];
        missiles = [];
        enemyBullets = [];
        enemyRespawnTimer = 10;
        waveIndex = 0;
        waveTimer = 0;
        if (secondaryWeapon) {
            secondaryWeapon.timer = 0;
            secondaryWeapon._last = 0;
        }
        flightState = 'grounded';
        shipEl.src = 'assets/ship.png';
        ship.x = CW / 2;
        ship.y = CH * 0.80;
        ship.vx = 0; ship.vy = 0;
        ship.worldY = CH * 0.2;
        correctCount = 0;
        sessionStart = Date.now();
        if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; }
    }

    function triggerGameOver() {
        gameOver = true;
        flightState = 'grounded';
        shipEl.src = 'assets/ship.png';

        if (!open && !locked) {
            setTimeout(resetGame, 0);
            return;
        }

        gameOverEl = document.createElement('div');
        gameOverEl.id = 'idle-gameover';

        var msg = document.createElement('div');
        msg.id = 'idle-gameover-msg';
        msg.textContent = 'Ship destroyed.';
        gameOverEl.appendChild(msg);

        var btn = document.createElement('button');
        btn.id = 'idle-gameover-btn';
        btn.textContent = 'Retry?';
        btn.addEventListener('click', resetGame);
        gameOverEl.appendChild(btn);

        document.body.appendChild(gameOverEl);
    }

    function updateUI() {
        if (!spmEl) return;
        spmEl.textContent = getSPM() + '\u2009/spm';
    }

    // ── submit patch ──────────────────────────────────────────────────────────
    function patchSubmitAnswer() {
        if (typeof window.submitAnswer !== 'function') return;
        var orig = window.submitAnswer;
        window.submitAnswer = function () {
            orig.apply(this, arguments);
            var fb = document.getElementById('feedback');
            if (fb && fb.className.indexOf('correct') !== -1) {
                var path = window.location.pathname;
                var amt =
                    path.indexOf('index') !== -1 ? 0.1 :
                        path.indexOf('division') !== -1 ? 0.25 :
                            path.indexOf('addsubtract') !== -1 ? (window.idleQuestionValue || 0.3) :
                                path.indexOf('fractions') !== -1 ? 5 : 0.1;
                award(amt);
            }
        };
    }

    // ── init ──────────────────────────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', function () {
        // restore missile unlock across sessions
        if (localStorage.getItem('idle_missile_unlocked') === '1') {
            secondaryWeapon = { type: 'missile', cooldown: 4.5, timer: 0, _last: 0 };
        }

        buildDOM();

        if (MOBILE && window.visualViewport) {
            function updateCanvasToViewport() {
                var vv = window.visualViewport;
                CH = Math.round(vv.height);
                canvasEl.style.top = Math.round(vv.offsetTop) + 'px';
                canvasEl.style.height = CH + 'px';
                canvasEl.height = CH;
                positionCanvas();
                if (toggleEl) {
                    var kbH = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
                    toggleEl.style.bottom = (kbH + 96) + 'px';
                }
            }
            window.visualViewport.addEventListener('resize', updateCanvasToViewport);
            updateCanvasToViewport();
        }

        patchSubmitAnswer();
        spawnLevel();
        enemyRespawnTimer = 10;
        ship.worldY = CH * 0.2;
        updateUI();
        lastRaf = performance.now();
        requestAnimationFrame(rafLoop);

        window.addEventListener('resize', function () {
            CH = window.innerHeight;
            CW = Math.round(CH * (4 / 10));
            positionCanvas();
            if (flightState === 'grounded') {
                ship.x = CW / 2;
                ship.y = CH * 0.8;
            }
        });
    });
}());