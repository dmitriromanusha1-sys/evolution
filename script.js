// ── АУДИО ──
const audioMenu = new Audio('assept/menu.mp3');
const audioGame = new Audio('assept/game.mp3');
audioMenu.loop = true;
audioGame.loop = true;
audioMenu.volume = 0.5;
audioGame.volume = 0.4;

function playMusic(track) {
    if (track === 'menu') {
        if (!audioMenu.paused) return;
        audioGame.pause();
        audioGame.currentTime = 0;
        audioMenu.play().catch(() => {});
    } else {
        if (!audioGame.paused) return;
        audioMenu.pause();
        audioMenu.currentTime = 0;
        audioGame.play().catch(() => {});
    }
}

// Игровые переменные
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let gameWidth, gameHeight;

// Фон карты
const mapImage = new Image();
mapImage.src = 'assept/map.png';

// Спрайт игрока с удалением зелёного фона (chroma key)
const playerImage = new Image();
playerImage.src = 'assept/player.png';
let playerImageClean = null;
playerImage.onload = () => {
    const oc = document.createElement('canvas');
    oc.width = playerImage.naturalWidth;
    oc.height = playerImage.naturalHeight;
    const ox = oc.getContext('2d');
    ox.drawImage(playerImage, 0, 0);
    const id = ox.getImageData(0, 0, oc.width, oc.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        // Убираем зелёный фон: G явно доминирует над R и B
        if (g > 100 && g > r * 1.4 && g > b * 1.4) d[i+3] = 0;
    }
    ox.putImageData(id, 0, 0);
    playerImageClean = oc;
};

// Спрайты врагов [Ближник, Дальник, Танк, Целитель, Босс]
const enemySprites = [];
['assept/Melee Spider.png','assept/Ranged Spider.png','assept/Armored spider.png','assept/Spider healer.png','assept/Spider boss.png'].forEach((src, i) => {
    const img = new Image();
    img.src = src;
    enemySprites[i] = img;
});

// Режимы игры
const GAME_MODES = {
    NORMAL:   { name: "Нормальный", enemyMultiplier: 1.0, rewardMultiplier: 1.0, bossEvery: 5, hardcore: false },
    HARD:     { name: "Сложный",    enemyMultiplier: 1.5, rewardMultiplier: 0.7, bossEvery: 3, hardcore: false },
    HARDCORE: { name: "Хардкор",    enemyMultiplier: 1.2, rewardMultiplier: 1.0, bossEvery: 5, hardcore: true,
                hpMult: 1.2, damageMult: 1.25, speedMult: 1.1 },
    BOSS_RUSH:{ name: "Босс Руш",   enemyMultiplier: 2.0, rewardMultiplier: 2.0, bossEvery: 1, hardcore: false }
};

let currentGameMode = GAME_MODES.NORMAL;

// Мышь
let mouseX = 0;
let mouseY = 0;
let mouseDown = false;

// Автострельба
let autoShootEnabled = false;
let autoShootActive = false;
let autoShootButton = null;

// Обновление размеров холста
function updateCanvasSize() {
    const container = document.getElementById('canvas-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    gameWidth = canvas.width;
    gameHeight = canvas.height;
}

// Инициализация размеров
updateCanvasSize();

// Система волн врагов
let currentWave = 1;
let enemiesInWave = 10;
let enemiesKilledInWave = 0;
let waveReward = 100;
let waveActive = true;
let waveTimer = 0;
const WAVE_COOLDOWN = 3000;

// Предупреждение о боссе
let bossWarning = 0; // таймер в мс (5000→0), >0 = идёт предупреждение

// Система комбо
let combo = 0;
let comboMultiplier = 1.0;
let lastKillTime = 0;
let comboTimeout = 2000;
let comboBonus = 0;

// Ускоренная стрельба
let rapidFireActive = true;
let rapidFireTimer = 0;
let rapidFireDuration = 0;
const MAX_RAPID_FIRE = 3000;

// Типы врагов
// 0 - Ближник, 1 - Дальник, 2 - Танк, 3 - Целитель, 4 - Босс
const enemyTypes = [
    { name: "Ближник", color: "#ff6600", healthMultiplier: 0.8,  speedMultiplier: 1.6,  moneyMultiplier: 1.0, sizeMultiplier: 0.9,  isRanged: false, isHealer: false, isBoss: false },
    { name: "Дальник", color: "#00aaff", healthMultiplier: 0.6,  speedMultiplier: 0.7,  moneyMultiplier: 1.3, sizeMultiplier: 0.85, isRanged: true,  isHealer: false, isBoss: false },
    { name: "Танк",    color: "#9944ff", healthMultiplier: 3.5,  speedMultiplier: 0.45, moneyMultiplier: 1.8, sizeMultiplier: 1.5,  isRanged: false, isHealer: false, isBoss: false },
    { name: "Целитель",color: "#00dd77", healthMultiplier: 0.7,  speedMultiplier: 0.55, moneyMultiplier: 2.0, sizeMultiplier: 0.9,  isRanged: false, isHealer: true,  isBoss: false },
    { name: "БОСС",    color: "#ffcc00", healthMultiplier: 8.0,  speedMultiplier: 0.5,  moneyMultiplier: 6.0, sizeMultiplier: 2.2,  isRanged: false, isHealer: false, isBoss: true  }
];

// Достижения
const achievements = {
    firstKill: { unlocked: false, name: "Первая кровь", desc: "Убейте первого врага", icon: "🎯", reward: 50 },
    weaponMaster: { unlocked: false, name: "Мастер оружия", desc: "Достигните максимального уровня оружия", icon: "🔫", reward: 200 },
    rich: { unlocked: false, name: "Богач", desc: "Накопите 5000 денег", icon: "💰", reward: 500 },
    survivor: { unlocked: false, name: "Выживший", desc: "Пройдите 10 волн", icon: "🛡️", reward: 300 },
    comboKing: { unlocked: false, name: "Король комбо", desc: "Достигните комбо x20", icon: "👑", reward: 400 },
    speedDemon: { unlocked: false, name: "Демон скорости", desc: "Активируйте ускоренную стрельбу 25 раз", icon: "⚡", reward: 250 },
    tankBuster: { unlocked: false, name: "Уничтожитель танков", desc: "Убейте 100 танков", icon: "💥", reward: 350 },
    bossSlayer: { unlocked: false, name: "Убийца боссов", desc: "Убейте 10 боссов", icon: "👹", reward: 1000 },
    skillMaster: { unlocked: false, name: "Мастер навыков", desc: "Изучите все навыки", icon: "🌟", reward: 800 },
    perfectWave: { unlocked: false, name: "Идеальная волна", desc: "Завершите волну без получения урона", icon: "⭐", reward: 600 }
};

let achievementCounters = {
    rapidFireActivations: 0,
    tanksKilled: 0,
    bossesKilled: 0,
    damageTakenInWave: 0
};

// Миссии
let missions = [
    { id: 1, name: "Убийца новичков", desc: "Убейте 50 врагов", target: 50, current: 0, reward: 100, completed: false },
    { id: 2, name: "Собиратель денег", desc: "Соберите 1000 денег", target: 1000, current: 0, reward: 200, completed: false },
    { id: 3, name: "Мастер эволюции", desc: "Улучшите оружие 3 раза", target: 3, current: 0, reward: 150, completed: false },
    { id: 4, name: "Волновой воин", desc: "Пройдите 5 волн", target: 5, current: 0, reward: 300, completed: false },
    { id: 5, name: "Комбо эксперт", desc: "Достигните комбо x10", target: 10, current: 0, reward: 250, completed: false },
    { id: 6, name: "Навыковед", desc: "Изучите 5 навыков", target: 5, current: 0, reward: 350, completed: false },
    { id: 7, name: "Убийца боссов", desc: "Убейте 3 боссов", target: 3, current: 0, reward: 500, completed: false },
    { id: 8, name: "Безупречный", desc: "Завершите волну без урона", target: 1, current: 0, reward: 400, completed: false },
    { id: 9, name: "Богатей", desc: "Накопите 5000 денег", target: 5000, current: 0, reward: 1000, completed: false },
    { id: 10, name: "Легенда", desc: "Достигните 20 уровня", target: 20, current: 0, reward: 1500, completed: false }
];

// Система уровней персонажа
let playerLevel = 1;
let playerExp = 0;
let expToNextLevel = 100;
let skillPoints = 0;

// Улучшенная система навыков персонажа
let playerSkills = {
    vitality: {
        name: "Живучесть",
        level: 0,
        maxLevel: 15,
        cost: 1,
        effect: "Увеличивает максимальное здоровье на 30 за уровень",
        getEffect: function() {
            return `+${this.level * 30} к здоровью`;
        },
        apply: function() {
            player.maxHealth = 100 + this.level * 30;
            if (player.health > player.maxHealth) {
                player.health = player.maxHealth;
            }
        }
    },
    speed: {
        name: "Скорость",
        level: 0,
        maxLevel: 15,
        cost: 1,
        effect: "Увеличивает скорость движения на 0.8 за уровень",
        getEffect: function() {
            return `+${this.level * 0.8} к скорости`;
        },
        apply: function() {
            player.speed = 2.5 + this.level * 0.4;
        }
    },
    regen: {
        name: "Регенерация",
        level: 0,
        maxLevel: 15,
        cost: 1,
        effect: "Восстанавливает здоровье со временем (0.8/сек за уровень)",
        getEffect: function() {
            return `+${this.level * 0.8}/сек к регенерации`;
        },
        apply: function() {
            // Применяется в игровом цикле
        }
    },
    critical: {
        name: "Критический удар",
        level: 0,
        maxLevel: 15,
        cost: 2,
        effect: "Шанс нанести тройной урон (8% за уровень)",
        getEffect: function() {
            return `${this.level * 8}% шанс крита`;
        },
        apply: function() {
            // Применяется при расчете урона
        }
    },
    greed: {
        name: "Жадность",
        level: 0,
        maxLevel: 15,
        cost: 1,
        effect: "Увеличивает получаемые деньги на 15% за уровень",
        getEffect: function() {
            return `+${this.level * 15}% к деньгам`;
        },
        apply: function() {
            // Применяется при получении денег
        }
    },
    luck: {
        name: "Удача",
        level: 0,
        maxLevel: 15,
        cost: 2,
        effect: "Шанс получить дополнительный опыт (8% за уровень)",
        getEffect: function() {
            return `${this.level * 8}% шанс бонусного опыта`;
        },
        apply: function() {
            // Применяется при получении опыта
        }
    },
    combo: {
        name: "Комбо мастер",
        level: 0,
        maxLevel: 10,
        cost: 3,
        effect: "Увеличивает время комбо и бонус множителя (0.8 сек за уровень)",
        getEffect: function() {
            return `+${this.level * 0.8} сек к комбо`;
        },
        apply: function() {
            comboBonus = this.level * 0.8;
            comboTimeout = 2000 + this.level * 800;
        }
    },
    shield: {
        name: "Щит",
        level: 0,
        maxLevel: 5,
        cost: 3,
        effect: "Дает шанс заблокировать урон (10% за уровень)",
        getEffect: function() {
            return `${this.level * 10}% шанс блока`;
        },
        apply: function() {
            // Применяется при получении урона
        }
    }
};

// Таймер регенерации
let regenTimer = 0;
const regenInterval = 1000;

// Игровые объекты
let player = {
    x: 0,
    y: 0,
    width: 40,
    height: 60,
    speed: 2.5,
    health: 100,
    maxHealth: 100,
    color: '#4db8ff'
};

// Инициализация позиции игрока
player.x = gameWidth / 2 - player.width / 2;
player.y = gameHeight / 2 - player.height / 2;

// Система денег
let money = 100;
let weaponUpgradeReady = false;
let winShown = false;

// Улучшенная система улучшений оружия
let weaponUpgrades = {
    damage: {
        level: 1,
        maxLevel: 20,
        multiplier: 1.0,
        cost: 50,
        costMultiplier: 1.5
    },
    fireRate: {
        level: 1,
        maxLevel: 20,
        multiplier: 1.0,
        cost: 50,
        costMultiplier: 1.5
    },
    bulletSpeed: {
        level: 1,
        maxLevel: 15,
        multiplier: 1.0,
        cost: 50,
        costMultiplier: 1.5
    },
    bulletSize: {
        level: 1,
        maxLevel: 10,
        multiplier: 1.0,
        cost: 75,
        costMultiplier: 1.8
    },
    recoil: {
        level: 1,
        maxLevel: 5,
        multiplier: 1.0,
        cost: 100,
        costMultiplier: 2.0
    }
};

// Оружие (добавлены новые уровни)
const weapons = [
    {
        name: "Лук",
        level: 1,
        baseDamage: 10,
        baseFireRate: 1.0,
        baseBulletSpeed: 8,
        bulletsPerShot: 1,
        color: "#8B4513",
        icon: "🏹",
        bulletSize: 6,
        upgradeExpCost: 100,
        upgradeMoneyCost: 50
    },
    {
        name: "Арбалет",
        level: 2,
        baseDamage: 18,
        baseFireRate: 1.5,
        baseBulletSpeed: 10,
        bulletsPerShot: 1,
        color: "#A0522D",
        icon: "🏹",
        bulletSize: 7,
        upgradeExpCost: 250,
        upgradeMoneyCost: 100
    },
    {
        name: "Гладкоствольная винтовка",
        level: 3,
        baseDamage: 30,
        baseFireRate: 2.0,
        baseBulletSpeed: 12,
        bulletsPerShot: 1,
        color: "#696969",
        icon: "🔫",
        bulletSize: 8,
        upgradeExpCost: 500,
        upgradeMoneyCost: 200
    },
    {
        name: "Нарезная винтовка",
        level: 4,
        baseDamage: 45,
        baseFireRate: 2.5,
        baseBulletSpeed: 15,
        bulletsPerShot: 2,
        color: "#808080",
        icon: "🔫",
        bulletSize: 8,
        upgradeExpCost: 1000,
        upgradeMoneyCost: 400
    },
    {
        name: "Оружие Первой мировой",
        level: 5,
        baseDamage: 65,
        baseFireRate: 3.5,
        baseBulletSpeed: 18,
        bulletsPerShot: 2,
        color: "#A9A9A9",
        icon: "🔫",
        bulletSize: 9,
        upgradeExpCost: 2000,
        upgradeMoneyCost: 800
    },
    {
        name: "Оружие современности",
        level: 6,
        baseDamage: 100,
        baseFireRate: 5.0,
        baseBulletSpeed: 20,
        bulletsPerShot: 3,
        color: "#D3D3D3",
        icon: "🔫",
        bulletSize: 10,
        upgradeExpCost: 4000,
        upgradeMoneyCost: 1600
    },
    {
        name: "Плазменная пушка",
        level: 7,
        baseDamage: 150,
        baseFireRate: 7.0,
        baseBulletSpeed: 25,
        bulletsPerShot: 4,
        color: "#00ffff",
        icon: "💥",
        bulletSize: 12,
        upgradeExpCost: 8000,
        upgradeMoneyCost: 3200
    },
    {
        name: "Электромагнитная винтовка",
        level: 8,
        baseDamage: 250,
        baseFireRate: 10.0,
        baseBulletSpeed: 30,
        bulletsPerShot: 5,
        color: "#ff00ff",
        icon: "⚡",
        bulletSize: 15,
        upgradeExpCost: 20000,
        upgradeMoneyCost: 8000
    },
    {
        name: "Малый огнемёт",
        level: 9,
        baseDamage: 18,
        baseFireRate: 22.0,
        baseBulletSpeed: 5,
        bulletsPerShot: 1,
        color: "#ff6600",
        icon: "🔥",
        bulletSize: 16,
        upgradeExpCost: 40000,
        upgradeMoneyCost: 16000,
        isFlamethrower: true,
        flameLife: 700
    },
    {
        name: "Огнемёт будущего",
        level: 10,
        baseDamage: 40,
        baseFireRate: 28.0,
        baseBulletSpeed: 7,
        bulletsPerShot: 1,
        color: "#00ffaa",
        icon: "🔥",
        bulletSize: 22,
        upgradeExpCost: 0,
        upgradeMoneyCost: 0,
        isFlamethrower: true,
        flameLife: 1000
    }
];

let currentWeaponIndex = 0;
let currentWeapon = weapons[currentWeaponIndex];

// Вычисление фактических характеристик оружия с учетом улучшений
function getWeaponStats() {
    let baseDamage = Math.floor(currentWeapon.baseDamage * weaponUpgrades.damage.multiplier * 0.5);
    
    // Применяем критические удары
    let isCritical = false;
    let criticalChance = playerSkills.critical.level * 8;
    if (Math.random() * 100 < criticalChance) {
        baseDamage *= 3; // Тройной урон вместо двойного
        isCritical = true;
    }
    
    // Размер пули с учетом улучшений
    let bulletSize = currentWeapon.bulletSize * weaponUpgrades.bulletSize.multiplier;
    
    return {
        damage: baseDamage,
        fireRate: currentWeapon.baseFireRate * weaponUpgrades.fireRate.multiplier,
        bulletSpeed: currentWeapon.baseBulletSpeed * weaponUpgrades.bulletSpeed.multiplier,
        bulletSize: bulletSize,
        color: currentWeapon.color,
        bulletsPerShot: currentWeapon.bulletsPerShot,
        isCritical: isCritical
    };
}

// Пули
let bullets = [];
let lastShotTime = 0;

// Враги
let enemies = [];
let enemySpawnTimer = 0;
let enemySpawnRate = 1000;
let enemyIdCounter = 0;

// Игровые параметры
let score = 0;
let exp = 0;
let expToNextWeapon = weapons[currentWeaponIndex].upgradeExpCost;
let enemiesKilled = 0;
let gameOver = false;
let gameWin = false;
let gamePaused = false;
let keys = {};

// Элементы урона
let damageTexts = [];
let rewardTexts = [];

// Функция для показа уведомлений
function showNotification(text, type = "info", duration = 3000) {
    const notification = document.getElementById('notification');
    notification.textContent = text;
    notification.className = '';
    notification.style.display = 'block';
    
    if (type === "success") {
        notification.classList.add('notification-success');
    } else if (type === "warning") {
        notification.classList.add('notification-warning');
    } else if (type === "error") {
        notification.classList.add('notification-error');
    }
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

// Функция для разблокировки достижений
function unlockAchievement(key) {
    if (achievements[key] && !achievements[key].unlocked) {
        achievements[key].unlocked = true;
        
        const achievementDiv = document.createElement('div');
        achievementDiv.className = 'achievement';
        achievementDiv.innerHTML = `
            <div class="achievement-icon">${achievements[key].icon}</div>
            <div class="achievement-text">
                <div class="achievement-title">${achievements[key].name}</div>
                <div>${achievements[key].desc}</div>
                <div style="color:#ffcc00; margin-top:5px;">+$${achievements[key].reward}!</div>
            </div>
        `;
        
        document.getElementById('achievements-container').appendChild(achievementDiv);
        
        // Награда за достижение
        money += achievements[key].reward;
        
        // Показываем на 5 секунд
        setTimeout(() => {
            achievementDiv.style.display = 'none';
            setTimeout(() => achievementDiv.remove(), 1000);
        }, 5000);
        
        showNotification(`Достижение: ${achievements[key].name}! +$${achievements[key].reward}`, "success", 2000);
        updateStats();
    }
}

// Обновление миссий
function updateMissions() {
    const missionsList = document.getElementById('missions-list');
    missionsList.innerHTML = '';
    
    let completedMissions = 0;
    
    missions.forEach(mission => {
        const missionDiv = document.createElement('div');
        missionDiv.className = `mission-item ${mission.completed ? 'mission-complete' : ''}`;
        
        const progressPercent = (mission.current / mission.target) * 100;
        missionDiv.innerHTML = `
            <div><strong>${mission.name}</strong></div>
            <div style="font-size:0.8rem; color:#aaa; margin:5px 0;">${mission.desc}</div>
            <div class="mission-progress">
                <span>${mission.current}/${mission.target}</span>
                <span>Награда: $${mission.reward}</span>
            </div>
            <div style="height:3px; background:#2c5364; border-radius:2px; margin-top:5px;">
                <div style="height:100%; width:${Math.min(100, progressPercent)}%; background:#4db8ff; border-radius:2px;"></div>
            </div>
        `;
        
        missionsList.appendChild(missionDiv);
        
        if (mission.completed) completedMissions++;
    });
    
    document.getElementById('missions-completed').textContent = `${completedMissions}/${missions.length}`;
}

// Проверка выполнения миссий
function checkMissions() {
    missions.forEach(mission => {
        if (!mission.completed) {
            switch(mission.id) {
                case 1: // Убить 50 врагов
                    mission.current = enemiesKilled;
                    break;
                case 2: // Собрать 1000 денег
                    mission.current = money;
                    break;
                case 3: // Улучшить оружие 3 раза
                    // Обновляется при улучшении оружия
                    break;
                case 4: // Пройти 5 волн
                    mission.current = currentWave - 1;
                    break;
                case 5: // Комбо x10
                    mission.current = Math.max(mission.current, combo);
                    break;
                case 6: // Изучить 5 навыков
                    let skillsLearned = 0;
                    Object.keys(playerSkills).forEach(skill => {
                        skillsLearned += playerSkills[skill].level;
                    });
                    mission.current = skillsLearned;
                    break;
                case 7: // Убить 3 боссов
                    mission.current = achievementCounters.bossesKilled;
                    break;
                case 8: // Завершить волну без урона
                    // Обновляется при завершении волны
                    break;
                case 9: // Накопить 5000 денег
                    mission.current = money;
                    break;
                case 10: // Достигнуть 20 уровня
                    mission.current = playerLevel;
                    break;
            }
            
            if (mission.current >= mission.target) {
                mission.completed = true;
                money += mission.reward;
                showNotification(`Миссия выполнена: ${mission.name}! +$${mission.reward}`, "success", 2000);
                updateStats();
            }
        }
    });
    
    updateMissions();
}

// Обновление прогресса волны
function updateWaveProgress() {
    const progress = (enemiesKilledInWave / enemiesInWave) * 100;
    document.getElementById('wave-progress-text').textContent = 
        `Волна ${currentWave}: ${enemiesKilledInWave}/${enemiesInWave}`;
    document.getElementById('wave-progress-fill').style.width = `${progress}%`;
    
    document.getElementById('wave-progress-text-small').textContent = 
        `${enemiesKilledInWave}/${enemiesInWave}`;
    document.getElementById('wave-bar').style.width = `${progress}%`;
}

// Завершение волны
function completeWave() {
    waveActive = false;
    waveTimer = WAVE_COOLDOWN;
    
    // Проверяем миссию "безупречная волна"
    if (achievementCounters.damageTakenInWave === 0 && currentWave > 1) {
        missions[7].current = 1; // Миссия "Безупречный"
        checkMissions();
    }
    
    // Сбрасываем счетчик урона за волну
    achievementCounters.damageTakenInWave = 0;
    
    const bonusReward = Math.floor(waveReward * (1 + comboMultiplier * 0.2) * currentGameMode.rewardMultiplier);
    money += bonusReward;
    score += bonusReward * 10;
    
    document.getElementById('wave-kills').textContent = enemiesKilledInWave;
    document.getElementById('wave-reward').textContent = bonusReward;
    document.getElementById('wave-stats').style.display = 'block';
    
    showNotification(`Волна ${currentWave} завершена! Награда: $${bonusReward}`, "success");
    
    // Проверяем достижения
    if (currentWave >= 10) unlockAchievement('survivor');
    
    setTimeout(() => {
        document.getElementById('wave-stats').style.display = 'none';
    }, 3000);
    
    // Проверяем миссии
    checkMissions();
}

// Начало следующей волны
function startNextWave() {
    currentWave++;

    if (currentGameMode === GAME_MODES.HARDCORE) {
        enemiesInWave = 10 + currentWave * 2;
        enemySpawnRate = Math.max(200, 1000 - currentWave * 50);
    } else {
        enemiesInWave = 10 + currentWave * 2;
        enemySpawnRate = Math.max(200, 1000 - currentWave * 50);
    }

    enemiesKilledInWave = 0;
    waveReward = 100 + currentWave * 50;
    waveActive = true;

    const bossEvery = currentGameMode.bossEvery || 5;
    if (currentWave % bossEvery === 0) {
        enemiesInWave++;
        bossWarning = 5000;
        setTimeout(() => {
            bossWarning = 0;
            spawnBoss();
        }, 5000);
    }

    updateWaveProgress();

    const modeTag = currentGameMode === GAME_MODES.HARDCORE ? ' [💀]' : '';
    showNotification(`Волна ${currentWave}${modeTag}! Убейте ${enemiesInWave} врагов`, "info");
}

// Спавн босса
function spawnBoss() {
    const bossType = enemyTypes[4]; // Босс
    const size = 80 * bossType.sizeMultiplier;
    
    const x = gameWidth / 2 - size / 2;
    const y = gameHeight / 2 - size / 2;
    
    const baseHealth = 500 + currentWeaponIndex * 100 + currentWave * 50;
    const health = Math.floor(baseHealth * bossType.healthMultiplier * currentGameMode.enemyMultiplier);
    
    const enemyMoney = 500 + currentWave * 100;
    
    enemies.push({
        id: ++enemyIdCounter,
        x: x,
        y: y,
        width: size,
        height: size,
        speed: bossType.speedMultiplier * 0.5,
        health: health,
        maxHealth: health,
        money: enemyMoney,
        color: bossType.color,
        type: 4,
        typeName: bossType.name,
        isBoss: true,
        attackCooldown: 0
    });
    
    showNotification("⚠️ ПОЯВИЛСЯ БОСС! ⚠️", "warning", 2000);
}

// Обновление статистики на панели
function updateStats() {
    const stats = getWeaponStats();
    
    document.getElementById('weapon-name').textContent = currentWeapon.name;
    document.getElementById('weapon-level').textContent = `${currentWeapon.level}/${weapons.length}`;
    document.getElementById('weapon-icon').textContent = currentWeapon.icon;
    document.getElementById('damage').textContent = stats.damage;
    document.getElementById('fire-rate').textContent = `${stats.fireRate.toFixed(1)}/сек`;
    document.getElementById('bullet-speed').textContent = Math.floor(stats.bulletSpeed);
    document.getElementById('player-health').textContent = `${Math.max(0, Math.floor(player.health))}/${player.maxHealth}`;
    const hpPct = Math.max(0, player.health / player.maxHealth) * 100;
    document.getElementById('player-hp-bar-fill').style.width = hpPct + '%';
    document.getElementById('player-hp-bar-fill').style.background = hpPct > 50 ? 'linear-gradient(90deg,#00cc44,#00ff66)' : hpPct > 25 ? 'linear-gradient(90deg,#cc8800,#ffaa00)' : 'linear-gradient(90deg,#cc0000,#ff3333)';
    document.getElementById('player-hp-text').textContent = `❤ ${Math.max(0,Math.floor(player.health))}/${player.maxHealth}`;
    document.getElementById('movement-speed').textContent = player.speed.toFixed(1);
    document.getElementById('health-regen').textContent = `${playerSkills.regen.level * 0.8}/сек`;
    document.getElementById('score').textContent = score;
    document.getElementById('money').textContent = money;
    document.getElementById('player-level').textContent = playerLevel;
    document.getElementById('skill-points').textContent = skillPoints;
    document.getElementById('available-skill-points').textContent = skillPoints;
    document.getElementById('enemies-killed').textContent = enemiesKilled;
    document.getElementById('exp').textContent = `${exp}/${expToNextWeapon}`;
    document.getElementById('current-wave').textContent = currentWave;
    document.getElementById('combo-display-text').textContent = `x${comboMultiplier.toFixed(1)}`;
    
    document.getElementById('health-bar').style.width = `${(player.health / player.maxHealth) * 100}%`;
    document.getElementById('exp-bar').style.width = `${(exp / expToNextWeapon) * 100}%`;
    document.getElementById('level-bar').style.width = `${(playerExp / expToNextLevel) * 100}%`;
    
    const isMaxWeapon = currentWeaponIndex >= weapons.length - 1;
    const costText = isMaxWeapon ? "МАКСИМУМ" :
        `${weapons[currentWeaponIndex].upgradeExpCost} опыта + ${weapons[currentWeaponIndex].upgradeMoneyCost}$`;
    document.getElementById('upgrade-cost').textContent = costText;
    const modalCost = document.getElementById('upgrade-cost-modal');
    if (modalCost) modalCost.textContent = costText;

    const upgradeBtn = document.getElementById('upgrade-weapon-btn');
    if (isMaxWeapon) {
        upgradeBtn.textContent = "МАКСИМАЛЬНЫЙ УРОВЕНЬ";
        upgradeBtn.disabled = true;
    } else {
        upgradeBtn.textContent = `Новое оружие (${weapons[currentWeaponIndex].upgradeMoneyCost}$)`;
        upgradeBtn.disabled = exp < weapons[currentWeaponIndex].upgradeExpCost || money < weapons[currentWeaponIndex].upgradeMoneyCost;
    }
    
    document.getElementById('damage-level').textContent = weaponUpgrades.damage.level;
    document.getElementById('firerate-level').textContent = weaponUpgrades.fireRate.level;
    document.getElementById('bulletspeed-level').textContent = weaponUpgrades.bulletSpeed.level;
    document.getElementById('bulletsize-level').textContent = weaponUpgrades.bulletSize.level;
    document.getElementById('recoil-level').textContent = weaponUpgrades.recoil.level;
    
    document.getElementById('damage-cost').textContent = weaponUpgrades.damage.cost;
    document.getElementById('firerate-cost').textContent = weaponUpgrades.fireRate.cost;
    document.getElementById('bulletspeed-cost').textContent = weaponUpgrades.bulletSpeed.cost;
    document.getElementById('bulletsize-cost').textContent = weaponUpgrades.bulletSize.cost;
    document.getElementById('recoil-cost').textContent = weaponUpgrades.recoil.cost;
    
    document.getElementById('upgrade-damage-btn').disabled = 
        money < weaponUpgrades.damage.cost || weaponUpgrades.damage.level >= weaponUpgrades.damage.maxLevel;
    document.getElementById('upgrade-firerate-btn').disabled = 
        money < weaponUpgrades.fireRate.cost || weaponUpgrades.fireRate.level >= weaponUpgrades.fireRate.maxLevel;
    document.getElementById('upgrade-bulletspeed-btn').disabled = 
        money < weaponUpgrades.bulletSpeed.cost || weaponUpgrades.bulletSpeed.level >= weaponUpgrades.bulletSpeed.maxLevel;
    document.getElementById('upgrade-bulletsize-btn').disabled = 
        money < weaponUpgrades.bulletSize.cost || weaponUpgrades.bulletSize.level >= weaponUpgrades.bulletSize.maxLevel;
    document.getElementById('upgrade-recoil-btn').disabled = 
        money < weaponUpgrades.recoil.cost || weaponUpgrades.recoil.level >= weaponUpgrades.recoil.maxLevel;
        
    document.getElementById('upgrade-damage-btn').textContent = 
        weaponUpgrades.damage.level >= weaponUpgrades.damage.maxLevel ? "МАКС." : "Улучшить";
    document.getElementById('upgrade-firerate-btn').textContent = 
        weaponUpgrades.fireRate.level >= weaponUpgrades.fireRate.maxLevel ? "МАКС." : "Улучшить";
    document.getElementById('upgrade-bulletspeed-btn').textContent = 
        weaponUpgrades.bulletSpeed.level >= weaponUpgrades.bulletSpeed.maxLevel ? "МАКС." : "Улучшить";
    document.getElementById('upgrade-bulletsize-btn').textContent = 
        weaponUpgrades.bulletSize.level >= weaponUpgrades.bulletSize.maxLevel ? "МАКС." : "Улучшить";
    document.getElementById('upgrade-recoil-btn').textContent = 
        weaponUpgrades.recoil.level >= weaponUpgrades.recoil.maxLevel ? "МАКС." : "Улучшить";
    
    Object.keys(playerSkills).forEach(skill => {
        const skillData = playerSkills[skill];
        document.getElementById(`${skill}-level`).textContent = skillData.level;
        document.getElementById(`${skill}-effect`).textContent = skillData.getEffect();
        const costText = skillData.cost === 1 ? '1 очко' : `${skillData.cost} очка`;
        document.getElementById(`${skill}-cost`).textContent = costText;
        
        const upgradeBtn = document.getElementById(`upgrade-${skill}-btn`);
        upgradeBtn.textContent = skillData.level >= skillData.maxLevel ? 
            "МАКС." : `Изучить (${skillData.cost})`;
        upgradeBtn.disabled = skillPoints < skillData.cost || skillData.level >= skillData.maxLevel;
    });
    
    // Обновление кнопки автострельбы
    if (autoShootButton) {
        autoShootButton.textContent = autoShootActive ? "Выкл автострельбу (Q)" : "Автострельба (Q)";
        autoShootButton.style.background = autoShootActive ? 
            "linear-gradient(to bottom, #00cc66, #00994d)" : 
            "linear-gradient(to bottom, #4db8ff, #0066cc)";
        autoShootButton.style.boxShadow = autoShootActive ? 
            "0 4px 0 #006633" : "0 4px 0 #004080";
    }
    
    if (combo > 1) {
        if (typeof showCombo === 'undefined' || showCombo) document.getElementById('combo-display').style.display = 'block';
        document.getElementById('combo-count').textContent = `COMBO x${combo}`;
        document.getElementById('combo-multiplier').textContent = `Множитель: x${comboMultiplier.toFixed(1)}`;
    } else {
        document.getElementById('combo-display').style.display = 'none';
    }

    // Подсказка о доступном улучшении оружия
    const canUpgrade = currentWeaponIndex < weapons.length - 1 &&
        exp >= weapons[currentWeaponIndex].upgradeExpCost &&
        money >= weapons[currentWeaponIndex].upgradeMoneyCost;
    if (canUpgrade && !weaponUpgradeReady) {
        weaponUpgradeReady = true;
        showNotification(`🔫 Доступно новое оружие! Нажми Q`, 'success', 3500);
    } else if (!canUpgrade) {
        weaponUpgradeReady = false;
    }
}

// Проверка повышения уровня персонажа
function checkLevelUp() {
    if (playerExp >= expToNextLevel) {
        playerLevel++;
        skillPoints++;
        playerExp -= expToNextLevel;
        expToNextLevel = Math.floor(expToNextLevel * 1.5);
        
        player.health = player.maxHealth;
        
        showNotification(`Уровень повышен! Теперь у вас ${skillPoints} очков навыков`, "success");
        
        updateStats();
        checkMissions();
    }
}

// Добавление опыта персонажу
function addPlayerExp(amount) {
    let bonusChance = playerSkills.luck.level * 8;
    if (Math.random() * 100 < bonusChance) {
        amount *= 1.5;
    }
    
    playerExp += amount;
    checkLevelUp();
    updateStats();
}

// Включение/выключение автострельбы
function toggleAutoShoot() {
    autoShootActive = !autoShootActive;
    
    if (autoShootActive) {
        showNotification("Автострельба включена!", "success", 1500);
    } else {
        showNotification("Автострельба выключена", "info", 1500);
    }
    
    updateStats();
}

// Активация ускоренной стрельбы
function activateRapidFire() {
    if (rapidFireActive) return;
    
    rapidFireActive = true;
    rapidFireDuration = MAX_RAPID_FIRE;
    rapidFireTimer = 0;
    achievementCounters.rapidFireActivations++;
    
    document.getElementById('rapid-fire-indicator').style.display = 'block';
    
    showNotification("Ускоренная стрельба активирована!", "success", 1000);
    
    if (achievementCounters.rapidFireActivations >= 25) {
        unlockAchievement('speedDemon');
    }
}

// Создание пули в направлении курсора мыши
function shoot(targetX, targetY) {
    const now = Date.now();
    const stats = getWeaponStats();
    
    const fireRateMultiplier = rapidFireActive ? 3.0 : 1.0;
    const timeBetweenShots = 1000 / (stats.fireRate * fireRateMultiplier * 0.77);
    
    if (now - lastShotTime >= timeBetweenShots) {
        const dx = targetX - (player.x + player.width / 2);
        const dy = targetY - (player.y + player.height / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
            const baseAngle = Math.atan2(dy, dx);

            if (currentWeapon.isFlamethrower) {
                // Огнемёт: 3 частицы в конусе ±0.35 рад
                const isFuture = currentWeapon.level === 10;
                const spread = isFuture ? 0.45 : 0.35;
                const particleCount = isFuture ? 4 : 3;
                for (let p = 0; p < particleCount; p++) {
                    const angle = baseAngle + (Math.random() - 0.5) * 2 * spread;
                    const speedVar = stats.bulletSpeed * (0.8 + Math.random() * 0.4);
                    const lifeMs = currentWeapon.flameLife * (0.7 + Math.random() * 0.6);
                    const sizeVar = stats.bulletSize * (0.7 + Math.random() * 0.6);
                    bullets.push({
                        x: player.x + player.width / 2,
                        y: player.y + player.height / 2,
                        width: sizeVar,
                        height: sizeVar,
                        speedX: Math.cos(angle) * speedVar,
                        speedY: Math.sin(angle) * speedVar,
                        damage: stats.damage,
                        color: stats.color,
                        isCritical: stats.isCritical,
                        isFlame: true,
                        isFuture: isFuture,
                        life: lifeMs,
                        maxLife: lifeMs,
                        hitEnemies: new Set()
                    });
                }
            } else {
                const bulletsPerShot = stats.bulletsPerShot;
                for (let i = 0; i < bulletsPerShot; i++) {
                    const angleOffset = bulletsPerShot > 1 ? (i - (bulletsPerShot - 1) / 2) * 0.1 : 0;
                    const angle = baseAngle + angleOffset;
                    bullets.push({
                        x: player.x + player.width / 2,
                        y: player.y + player.height / 2,
                        width: stats.bulletSize,
                        height: stats.bulletSize,
                        speedX: Math.cos(angle) * stats.bulletSpeed,
                        speedY: Math.sin(angle) * stats.bulletSpeed,
                        damage: stats.damage,
                        color: stats.isCritical ? '#ff3333' : stats.color,
                        isCritical: stats.isCritical
                    });
                }
            }
        }

        const recoilMultiplier = 1.0 - (weaponUpgrades.recoil.level - 1) * 0.2;
        if (!currentWeapon.isFlamethrower) {
            player.x -= (mouseX - (player.x + player.width/2)) / 100 * recoilMultiplier;
            player.y -= (mouseY - (player.y + player.height/2)) / 100 * recoilMultiplier;
        }

        lastShotTime = now;
    }
}

// Создание текста урона
function createDamageText(x, y, damage, isCritical) {
    damageTexts.push({
        x: x,
        y: y,
        text: `-${damage}`,
        color: isCritical ? '#ffaa00' : '#ff3333',
        size: isCritical ? 18 : 14,
        life: 60,
        velocityY: -1.5,
        opacity: 1.0
    });
}

// Создание текста награды
function createRewardText(x, y, text) {
    rewardTexts.push({
        x: x,
        y: y,
        text: text,
        color: '#00ff00',
        size: 12,
        life: 90,
        velocityY: -1.0,
        opacity: 1.0
    });
}

// Создание врага
function spawnEnemy() {
    if (!waveActive) return;

    // Вероятности появления типов по волне
    let pool = [0]; // Ближник всегда есть
    if (currentWave >= 2) pool.push(1);       // Дальник с волны 2
    if (currentWave >= 3) pool.push(3);       // Целитель с волны 3
    if (currentWave >= 4) pool.push(2);       // Танк с волны 4
    // Босс спавнится отдельно через spawnBoss

    // Взвешенные вероятности
    const weights = { 0: 35, 1: 30, 2: 15, 3: 20 };
    let totalWeight = 0;
    pool.forEach(t => totalWeight += (weights[t] || 10));
    let r = Math.random() * totalWeight;
    let typeIndex = pool[0];
    for (const t of pool) {
        r -= (weights[t] || 10);
        if (r <= 0) { typeIndex = t; break; }
    }

    const type = enemyTypes[typeIndex];
    const size = (20 + Math.random() * 18) * type.sizeMultiplier;

    const side = Math.floor(Math.random() * 4);
    let x, y;
    switch(side) {
        case 0: x = Math.random() * gameWidth; y = -size; break;
        case 1: x = gameWidth + size; y = Math.random() * gameHeight; break;
        case 2: x = Math.random() * gameWidth; y = gameHeight + size; break;
        case 3: x = -size; y = Math.random() * gameHeight; break;
    }

    const hcHp    = currentGameMode.hardcore ? currentGameMode.hpMult    : 1;
    const hcSpeed = currentGameMode.hardcore ? currentGameMode.speedMult : 1;
    const baseHealth = 20 + currentWeaponIndex * 15 + currentWave * 5;
    const health = Math.floor(baseHealth * type.healthMultiplier * currentGameMode.enemyMultiplier * hcHp + Math.random() * 20);

    let enemyMoney = 5 + currentWeaponIndex * 3 + currentWave * 2;
    enemyMoney = Math.floor(enemyMoney * type.moneyMultiplier * currentGameMode.rewardMultiplier);
    enemyMoney = Math.floor(enemyMoney * (1 + playerSkills.greed.level * 0.15));

    enemies.push({
        id: ++enemyIdCounter,
        x, y,
        width: size,
        height: size,
        speed: (0.5 + Math.random() * 0.5) * type.speedMultiplier * hcSpeed,
        health,
        maxHealth: health,
        money: enemyMoney,
        color: type.color,
        type: typeIndex,
        typeName: type.name,
        isBoss: false,
        isRanged: type.isRanged || false,
        isHealer: type.isHealer || false,
        attackCooldown: typeIndex === 1 ? 1500 : 0,
        attackAnim: 0,
        healCooldown: 0
    });
}

// Обновление игры
function update() {
    if (gameOver || gameWin || gamePaused) return;
    
    // Автострельба
    if (autoShootActive && !gamePaused) {
        shoot(mouseX, mouseY);
    }
    
    if (!waveActive) {
        waveTimer -= 16;
        if (waveTimer <= 0) {
            startNextWave();
        }
    }
    
    // rapidFire всегда активна — таймер не нужен
    
    const now = Date.now();
    if (now - lastKillTime > comboTimeout && combo > 0) {
        combo = 0;
        comboMultiplier = 1.0;
        updateStats();
    }
    
    if (keys['KeyW'] || keys['ArrowUp']) player.y -= player.speed;
    if (keys['KeyS'] || keys['ArrowDown']) player.y += player.speed;
    if (keys['KeyA'] || keys['ArrowLeft']) player.x -= player.speed;
    if (keys['KeyD'] || keys['ArrowRight']) player.x += player.speed;
    
    if (mouseDown) {
        shoot(mouseX, mouseY);
    }
    
    regenTimer += 16;
    if (regenTimer >= regenInterval) {
        if (player.health < player.maxHealth) {
            player.health = Math.min(player.maxHealth, player.health + playerSkills.regen.level * 0.8);
        }
        regenTimer = 0;
    }
    
    player.x = Math.max(0, Math.min(gameWidth - player.width, player.x));
    player.y = Math.max(0, Math.min(gameHeight - player.height, player.y));
    
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.speedX;
        b.y += b.speedY;

        // Убываем жизнь огненных частиц
        if (b.isFlame) {
            b.life -= 16;
            if (b.life <= 0) { bullets.splice(i, 1); continue; }
        } else if (b.x < -b.width || b.x > gameWidth || b.y < -b.height || b.y > gameHeight) {
            bullets.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            const bullet = bullets[i];
            if (!bullet) break;
            if (bullet.isEnemyBullet) continue; // пули врагов не бьют врагов
            const enemy = enemies[j];

            if (bullet.x < enemy.x + enemy.width &&
                bullet.x + bullet.width > enemy.x &&
                bullet.y < enemy.y + enemy.height &&
                bullet.y + bullet.height > enemy.y) {

                // Огненные частицы проходят насквозь, каждая бьёт врага только раз
                if (bullet.isFlame) {
                    if (bullet.hitEnemies.has(enemy.id)) continue;
                    bullet.hitEnemies.add(enemy.id);
                    enemy.health -= bullet.damage;
                    createDamageText(enemy.x + enemy.width/2, enemy.y, bullet.damage, bullet.isCritical);
                    if (enemy.health <= 0) {
                        killEnemy(enemy, bullet);
                        createRewardText(enemy.x + enemy.width/2, enemy.y + 10, `+$${enemy.money}`);
                        if (enemy.type === 2) {
                            achievementCounters.tanksKilled++;
                            if (achievementCounters.tanksKilled >= 100) unlockAchievement('tankBuster');
                        }
                        if (enemy.isBoss) {
                            achievementCounters.bossesKilled++;
                            if (achievementCounters.bossesKilled >= 10) unlockAchievement('bossSlayer');
                        }
                        enemies.splice(j, 1);
                    }
                    continue;
                }

                enemy.health -= bullet.damage;
                bullets.splice(i, 1);
                
                createDamageText(enemy.x + enemy.width/2, enemy.y, bullet.damage, bullet.isCritical);
                
                if (enemy.health <= 0) {
                    killEnemy(enemy, bullet);
                    createRewardText(enemy.x + enemy.width/2, enemy.y + 10, `+$${enemy.money}`);
                    
                    if (enemy.type === 2) {
                        achievementCounters.tanksKilled++;
                        if (achievementCounters.tanksKilled >= 100) {
                            unlockAchievement('tankBuster');
                        }
                    }
                    
                    if (enemy.isBoss) {
                        achievementCounters.bossesKilled++;
                        if (achievementCounters.bossesKilled >= 10) {
                            unlockAchievement('bossSlayer');
                        }
                    }
                    
                    enemies.splice(j, 1);
                }
                break;
            }
        }
    }
    
    for (let i = damageTexts.length - 1; i >= 0; i--) {
        damageTexts[i].y += damageTexts[i].velocityY;
        damageTexts[i].life--;
        damageTexts[i].opacity = damageTexts[i].life / 60;
        
        if (damageTexts[i].life <= 0) {
            damageTexts.splice(i, 1);
        }
    }
    
    for (let i = rewardTexts.length - 1; i >= 0; i--) {
        rewardTexts[i].y += rewardTexts[i].velocityY;
        rewardTexts[i].life--;
        rewardTexts[i].opacity = rewardTexts[i].life / 90;
        
        if (rewardTexts[i].life <= 0) {
            rewardTexts.splice(i, 1);
        }
    }
    
    if (bossWarning > 0) bossWarning -= 16;

    if (waveActive) {
        enemySpawnTimer += 16;
        if (enemySpawnTimer >= enemySpawnRate && enemies.length < 20) {
            spawnEnemy();
            enemySpawnTimer = 0;
        }
    }
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const ex = enemy.x + enemy.width / 2;
        const ey = enemy.y + enemy.height / 2;
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const dx = px - ex;
        const dy = py - ey;
        const distance = Math.sqrt(dx * dx + dy * dy);

        enemy.attackCooldown -= 16;
        enemy.healCooldown = (enemy.healCooldown || 0) - 16;

        // === БОСС: атаки ===
        if (enemy.isBoss) {
            if (!enemy.bossPhase) enemy.bossPhase = 0;
            if (!enemy.bossAngle) enemy.bossAngle = 0;
            const baseDmg = 10 + currentWave;
            const hcDmg = currentGameMode.hardcore ? currentGameMode.damageMult : 1;

            if (enemy.attackCooldown <= 0) {
                if (!currentGameMode.hardcore) {
                    // Обычный режим: 8 радиальных пуль
                    for (let j = 0; j < 8; j++) {
                        const angle = (Math.PI * 2 / 8) * j;
                        bullets.push({ x: ex, y: ey, width: 10, height: 10,
                            speedX: Math.cos(angle) * 2.5, speedY: Math.sin(angle) * 2.5,
                            damage: baseDmg, color: '#ff4400', isCritical: false, isEnemyBullet: true });
                    }
                    enemy.attackCooldown = 2200;
                } else {
                    // Хардкор: чередует 3 паттерна
                    const phase = enemy.bossPhase % 3;
                    if (phase === 0) {
                        // Вращающаяся спираль: 12 пуль с накопленным углом
                        for (let j = 0; j < 12; j++) {
                            const angle = enemy.bossAngle + (Math.PI * 2 / 12) * j;
                            bullets.push({ x: ex, y: ey, width: 10, height: 10,
                                speedX: Math.cos(angle) * 3, speedY: Math.sin(angle) * 3,
                                damage: baseDmg * hcDmg, color: '#ff2200', isCritical: false, isEnemyBullet: true });
                        }
                        enemy.bossAngle += 0.35;
                        enemy.attackCooldown = 1600;
                    } else if (phase === 1) {
                        // Прицельный залп 5 пуль веером в игрока
                        const aimAngle = Math.atan2(dy, dx);
                        for (let j = -2; j <= 2; j++) {
                            const angle = aimAngle + j * 0.18;
                            bullets.push({ x: ex, y: ey, width: 12, height: 12,
                                speedX: Math.cos(angle) * 4, speedY: Math.sin(angle) * 4,
                                damage: baseDmg * hcDmg * 1.4, color: '#ff8800', isCritical: false, isEnemyBullet: true });
                        }
                        enemy.attackCooldown = 1800;
                    } else {
                        // Крестообразная волна: 4 направления по 3 пули
                        for (let dir = 0; dir < 4; dir++) {
                            const baseA = (Math.PI / 2) * dir;
                            for (let k = 0; k < 3; k++) {
                                const spd = 2 + k * 1.2;
                                bullets.push({ x: ex, y: ey, width: 9, height: 9,
                                    speedX: Math.cos(baseA) * spd, speedY: Math.sin(baseA) * spd,
                                    damage: baseDmg * hcDmg * 0.9, color: '#cc00ff', isCritical: false, isEnemyBullet: true });
                            }
                        }
                        enemy.attackCooldown = 2000;
                    }
                    enemy.bossPhase++;
                }
            }
        }

        // === ДАЛЬНИК: держит дистанцию и стреляет ===
        if (enemy.isRanged) {
            const preferredDist = 220;
            if (distance > preferredDist + 30) {
                // Подходит ближе
                enemy.x += (dx / distance) * enemy.speed;
                enemy.y += (dy / distance) * enemy.speed;
            } else if (distance < preferredDist - 30) {
                // Отходит
                enemy.x -= (dx / distance) * enemy.speed;
                enemy.y -= (dy / distance) * enemy.speed;
            }
            if (enemy.attackCooldown <= 0 && distance < 350) {
                bullets.push({
                    x: ex, y: ey,
                    width: 7, height: 7,
                    speedX: (dx / distance) * 3,
                    speedY: (dy / distance) * 3,
                    damage: 8 + currentWave,
                    color: '#00aaff',
                    isCritical: false,
                    isEnemyBullet: true
                });
                enemy.attackCooldown = 1800;
            }
        } else if (!enemy.isHealer) {
            // Ближник и Танк и Босс — идут к игроку
            if (distance > 0) {
                enemy.x += (dx / distance) * enemy.speed;
                enemy.y += (dy / distance) * enemy.speed;
            }
        }

        // === ЦЕЛИТЕЛЬ: держится сзади, лечит ближайших врагов ===
        if (enemy.isHealer) {
            // Держится на расстоянии 280-350 от игрока
            const preferredDist = 310;
            if (distance > preferredDist + 40) {
                enemy.x += (dx / distance) * enemy.speed;
                enemy.y += (dy / distance) * enemy.speed;
            } else if (distance < preferredDist - 40) {
                enemy.x -= (dx / distance) * enemy.speed;
                enemy.y -= (dy / distance) * enemy.speed;
            }
            // Лечит соседей (не боссов)
            if (enemy.healCooldown <= 0) {
                let healed = 0;
                for (const other of enemies) {
                    if (other === enemy || other.isBoss) continue;
                    const odx = (other.x + other.width/2) - ex;
                    const ody = (other.y + other.height/2) - ey;
                    const odist = Math.sqrt(odx*odx + ody*ody);
                    if (odist < 180 && other.health < other.maxHealth) {
                        const healAmt = Math.floor(other.maxHealth * 0.04);
                        other.health = Math.min(other.maxHealth, other.health + healAmt);
                        createRewardText(other.x + other.width/2, other.y - 5, `+${healAmt}❤`);
                        healed++;
                    }
                }
                enemy.healCooldown = 4500;
            }
        }

        // Анимация атаки (таймер убывает)
        if (enemy.attackAnim > 0) enemy.attackAnim -= 16;

        // Столкновение с игроком (только Ближник, Танк и Босс)
        if (!enemy.isRanged && !enemy.isHealer) {
            const touching =
                enemy.x < player.x + player.width &&
                enemy.x + enemy.width > player.x &&
                enemy.y < player.y + player.height &&
                enemy.y + enemy.height > player.y;

            if (touching && enemy.attackCooldown <= 0) {
                let damage = 5 + currentWeaponIndex * 2;
                if (enemy.type === 2) damage *= 2;  // Танк
                if (enemy.isBoss) damage *= 1.5;
                if (currentGameMode.hardcore) damage *= currentGameMode.damageMult;

                const blockChance = playerSkills.shield.level * 10;
                if (Math.random() * 100 >= blockChance) {
                    player.health -= damage;
                    achievementCounters.damageTakenInWave += damage;
                } else {
                    showNotification("Щит заблокировал урон!", "success", 500);
                }

                // Кулдаун атаки: Ближник 800мс, Танк 1400мс, Босс 600мс
                enemy.attackCooldown = enemy.isBoss ? 600 : (enemy.type === 2 ? 1400 : 800);
                enemy.attackAnim = 250; // длительность анимации вспышки

                document.getElementById('canvas-container').classList.add('shake');
                setTimeout(() => document.getElementById('canvas-container').classList.remove('shake'), 300);

                if (player.health <= 0) {
                    gameOver = true;
                    document.getElementById('game-over').classList.remove('hidden');
                    document.getElementById('final-score').textContent = `Ваш счет: ${score}`;
                    document.getElementById('final-money').textContent = `Заработано денег: ${money}`;
                    document.getElementById('final-level').textContent = `Достигнут уровень: ${playerLevel}`;
                    document.getElementById('waves-completed').textContent = `Пройдено волн: ${currentWave}`;
                    document.getElementById('game-mode-result').textContent = `Режим: ${currentGameMode.name}`;
                }
            }
        }

        // Пули врагов попадают в игрока
        for (let b = bullets.length - 1; b >= 0; b--) {
            const bullet = bullets[b];
            if (!bullet.isEnemyBullet) continue;
            if (bullet.x < player.x + player.width &&
                bullet.x + bullet.width > player.x &&
                bullet.y < player.y + player.height &&
                bullet.y + bullet.height > player.y) {

                const blockChance = playerSkills.shield.level * 10;
                if (Math.random() * 100 >= blockChance) {
                    player.health -= bullet.damage;
                    achievementCounters.damageTakenInWave += bullet.damage;
                } else {
                    showNotification("Щит заблокировал урон!", "success", 500);
                }
                bullets.splice(b, 1);

                if (player.health <= 0) {
                    gameOver = true;
                    document.getElementById('game-over').classList.remove('hidden');
                    document.getElementById('final-score').textContent = `Ваш счет: ${score}`;
                    document.getElementById('final-money').textContent = `Заработано денег: ${money}`;
                    document.getElementById('final-level').textContent = `Достигнут уровень: ${playerLevel}`;
                    document.getElementById('waves-completed').textContent = `Пройдено волн: ${currentWave}`;
                    document.getElementById('game-mode-result').textContent = `Режим: ${currentGameMode.name}`;
                }
            }
        }
    }
    
    updateStats();
}

// Улучшение оружия
function upgradeWeapon() {
    if (currentWeaponIndex >= weapons.length - 1) return;
    if (exp < weapons[currentWeaponIndex].upgradeExpCost || money < weapons[currentWeaponIndex].upgradeMoneyCost) return;
    
    exp -= weapons[currentWeaponIndex].upgradeExpCost;
    money -= weapons[currentWeaponIndex].upgradeMoneyCost;
    currentWeaponIndex++;
    currentWeapon = weapons[currentWeaponIndex];
    expToNextWeapon = weapons[currentWeaponIndex].upgradeExpCost;
    
    // Обновляем миссию по улучшению оружия
    missions[2].current = currentWeaponIndex;
    checkMissions();
    
    player.health = Math.min(player.maxHealth, player.health + 50);
    
    // Эффект улучшения оружия
    const evolutionEffect = document.getElementById('weapon-evolution');
    evolutionEffect.style.display = 'block';
    setTimeout(() => {
        evolutionEffect.style.display = 'none';
    }, 1000);
    
    document.getElementById('weapon-icon').classList.add('level-up');
    setTimeout(() => {
        document.getElementById('weapon-icon').classList.remove('level-up');
    }, 500);
    
    activateRapidFire();
    
    showNotification(`Оружие улучшено до ${currentWeapon.name}!`, "success");
    
    if (currentWeaponIndex === weapons.length - 1) {
        unlockAchievement('weaponMaster');
    }
    
    updateStats();
}

// Улучшение характеристики урона
function upgradeDamage() {
    if (money < weaponUpgrades.damage.cost || weaponUpgrades.damage.level >= weaponUpgrades.damage.maxLevel) return;
    
    money -= weaponUpgrades.damage.cost;
    weaponUpgrades.damage.level++;
    weaponUpgrades.damage.multiplier += 0.15;
    weaponUpgrades.damage.cost = Math.floor(weaponUpgrades.damage.cost * weaponUpgrades.damage.costMultiplier);
    
    showNotification("Урон увеличен!", "success", 1000);
    updateStats();
}

// Улучшение характеристик
function upgradeFireRate() {
    if (money < weaponUpgrades.fireRate.cost || weaponUpgrades.fireRate.level >= weaponUpgrades.fireRate.maxLevel) return;
    
    money -= weaponUpgrades.fireRate.cost;
    weaponUpgrades.fireRate.level++;
    weaponUpgrades.fireRate.multiplier += 0.08;
    weaponUpgrades.fireRate.cost = Math.floor(weaponUpgrades.fireRate.cost * weaponUpgrades.fireRate.costMultiplier);
    
    showNotification("Скорострельность увеличена!", "success", 1000);
    updateStats();
}

function upgradeBulletSpeed() {
    if (money < weaponUpgrades.bulletSpeed.cost || weaponUpgrades.bulletSpeed.level >= weaponUpgrades.bulletSpeed.maxLevel) return;
    
    money -= weaponUpgrades.bulletSpeed.cost;
    weaponUpgrades.bulletSpeed.level++;
    weaponUpgrades.bulletSpeed.multiplier += 0.12;
    weaponUpgrades.bulletSpeed.cost = Math.floor(weaponUpgrades.bulletSpeed.cost * weaponUpgrades.bulletSpeed.costMultiplier);
    
    showNotification("Скорость пуль увеличена!", "success", 1000);
    updateStats();
}

function upgradeBulletSize() {
    if (money < weaponUpgrades.bulletSize.cost || weaponUpgrades.bulletSize.level >= weaponUpgrades.bulletSize.maxLevel) return;
    
    money -= weaponUpgrades.bulletSize.cost;
    weaponUpgrades.bulletSize.level++;
    weaponUpgrades.bulletSize.multiplier += 0.10;
    weaponUpgrades.bulletSize.cost = Math.floor(weaponUpgrades.bulletSize.cost * weaponUpgrades.bulletSize.costMultiplier);
    
    showNotification("Размер пуль увеличен!", "success", 1000);
    updateStats();
}

function upgradeRecoil() {
    if (money < weaponUpgrades.recoil.cost || weaponUpgrades.recoil.level >= weaponUpgrades.recoil.maxLevel) return;
    
    money -= weaponUpgrades.recoil.cost;
    weaponUpgrades.recoil.level++;
    weaponUpgrades.recoil.multiplier += 0.20;
    weaponUpgrades.recoil.cost = Math.floor(weaponUpgrades.recoil.cost * weaponUpgrades.recoil.costMultiplier);
    
    showNotification("Отдача уменьшена!", "success", 1000);
    updateStats();
}

// Убийство врага с системой комбо
function killEnemy(enemy, bullet) {
    enemiesKilled++;
    enemiesKilledInWave++;
    
    const now = Date.now();
    if (now - lastKillTime < comboTimeout) {
        combo++;
        comboMultiplier = 1.0 + combo * 0.1;
        
        if (combo % 5 === 0) {
            showNotification(`Комбо x${combo}! Множитель: x${comboMultiplier.toFixed(1)}`, "warning", 1000);
        }
        
        if (combo >= 20) {
            unlockAchievement('comboKing');
        }
        
        // Проверяем миссию комбо
        missions[4].current = Math.max(missions[4].current, combo);
        checkMissions();
    } else {
        combo = 1;
        comboMultiplier = 1.0;
    }
    lastKillTime = now;
    
    const expGained = Math.floor((10 + currentWeaponIndex * 5) * comboMultiplier);
    const moneyGained = Math.floor(enemy.money * comboMultiplier);
    
    exp += expGained;
    addPlayerExp(expGained / 2);
    score += expGained * 10;
    money += moneyGained;
    
    if (enemiesKilled === 1) unlockAchievement('firstKill');
    if (money >= 5000) unlockAchievement('rich');
    
    updateWaveProgress();
    
    if (enemiesKilledInWave >= enemiesInWave && waveActive) {
        completeWave();
    }
    
    // Победа только в нормальном режиме
    if (currentGameMode !== GAME_MODES.HARDCORE &&
        currentWeaponIndex === weapons.length - 1 && enemiesKilled >= 100 && !winShown) {
        winShown = true;
        gameWin = true;
        document.getElementById('game-win').classList.remove('hidden');
        document.getElementById('win-score').textContent = `Ваш счет: ${score}`;
        document.getElementById('win-money').textContent = `Заработано денег: ${money}`;
        document.getElementById('win-level').textContent = `Достигнут уровень: ${playerLevel}`;
        document.getElementById('win-waves').textContent = `Пройдено волн: ${currentWave}`;
        document.getElementById('win-mode').textContent = `Режим: ${currentGameMode.name}`;
    }
}

// Улучшение навыка
function upgradeSkill(skillName) {
    const skill = playerSkills[skillName];
    if (!skill || skillPoints < skill.cost || skill.level >= skill.maxLevel) return;
    
    skillPoints -= skill.cost;
    skill.level++;
    skill.apply();
    
    showNotification(`Навык "${skill.name}" улучшен до уровня ${skill.level}!`, "success", 1500);
    updateStats();
    checkMissions();
}

// Отрисовка игры
function draw() {
    if (mapImage.complete && mapImage.naturalWidth > 0) {
        ctx.drawImage(mapImage, 0, 0, gameWidth, gameHeight);
    } else {
        ctx.fillStyle = '#0a1a22';
        ctx.fillRect(0, 0, gameWidth, gameHeight);
    }
    
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;

    if (playerImageClean) {
        ctx.drawImage(playerImageClean, player.x, player.y, player.width, player.height);
    } else if (playerImage.complete && playerImage.naturalWidth > 0) {
        ctx.drawImage(playerImage, player.x, player.y, player.width, player.height);
    } else {
        ctx.fillStyle = '#00cc44';
        ctx.beginPath();
        ctx.arc(cx, cy, player.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00ff66';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, player.width / 2, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    if (!gameOver && !gameWin && !gamePaused) {
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mouseX - 15, mouseY);
        ctx.lineTo(mouseX + 15, mouseY);
        ctx.moveTo(mouseX, mouseY - 15);
        ctx.lineTo(mouseX, mouseY + 15);
        ctx.stroke();
    }
    
    bullets.forEach(bullet => {
        if (bullet.isFlame) {
            const t = bullet.life / bullet.maxLife; // 1→0 по мере угасания
            const r = bullet.width / 2 * (0.4 + t * 0.6); // размер уменьшается

            ctx.save();
            ctx.globalAlpha = t * 0.85;

            if (bullet.isFuture) {
                // Огнемёт будущего: сине-зелёный плазменный огонь
                const grad = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, r);
                grad.addColorStop(0, `rgba(220,255,255,${t})`);
                grad.addColorStop(0.3, `rgba(0,255,170,${t * 0.9})`);
                grad.addColorStop(0.7, `rgba(0,100,255,${t * 0.6})`);
                grad.addColorStop(1, 'rgba(0,0,80,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
                ctx.fill();
                // Искра в центре
                ctx.fillStyle = `rgba(255,255,255,${t})`;
                ctx.beginPath();
                ctx.arc(bullet.x, bullet.y, r * 0.25, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Малый огнемёт: оранжево-красный огонь
                const grad = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, r);
                grad.addColorStop(0, `rgba(255,255,180,${t})`);
                grad.addColorStop(0.25, `rgba(255,160,0,${t * 0.95})`);
                grad.addColorStop(0.6, `rgba(220,40,0,${t * 0.7})`);
                grad.addColorStop(1, 'rgba(80,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
                ctx.fill();
                // Ядро
                ctx.fillStyle = `rgba(255,255,200,${t * 0.8})`;
                ctx.beginPath();
                ctx.arc(bullet.x, bullet.y, r * 0.2, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        } else {
            ctx.fillStyle = bullet.color;
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.width/2, 0, Math.PI * 2);
            ctx.fill();

            if (!bullet.isEnemyBullet) {
                ctx.fillStyle = bullet.isCritical ? '#ff9900' : '#ffff00';
                const tracerLength = bullet.isCritical ? 10 : 5;
                ctx.fillRect(bullet.x - 1, bullet.y - tracerLength/2, 2, tracerLength);
            }
        }
    });
    
    enemies.forEach(enemy => {
        const ex = enemy.x + enemy.width / 2;
        const ey = enemy.y + enemy.height / 2;
        const er = enemy.width / 2;

        // Анимация атаки
        const animProg = (enemy.attackAnim || 0) / 250;
        const animScale = 1 + animProg * 0.2;
        const drawW = enemy.width * animScale;
        const drawH = enemy.height * animScale;

        const sprite = enemySprites[enemy.type];
        ctx.save();
        ctx.translate(ex, ey);
        if (animProg > 0) ctx.filter = `brightness(${1 + animProg * 2})`;
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
            ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
            ctx.fillStyle = enemy.color;
            ctx.beginPath();
            ctx.arc(0, 0, drawW / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.filter = 'none';
        ctx.restore();

        // Золотое кольцо для босса
        if (enemy.isBoss) {
            ctx.strokeStyle = `rgba(255,200,0,${0.5 + animProg * 0.4})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(ex, ey, er + 7, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Полоска HP
        const healthPercent = Math.max(0, enemy.health / enemy.maxHealth);
        const barTop = enemy.y - er - 9;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(enemy.x, barTop, enemy.width, 5);
        ctx.fillStyle = healthPercent > 0.5 ? '#00ee44' : healthPercent > 0.25 ? '#ffaa00' : '#ff2222';
        ctx.fillRect(enemy.x, barTop, enemy.width * healthPercent, 5);

        // Имя и деньги
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(enemy.typeName, ex, barTop - 4);
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('$' + enemy.money, ex, barTop - 14);
        ctx.textAlign = 'left';
    });
    
    // Предупреждение о боссе
    if (bossWarning > 0) {
        const prog = bossWarning / 5000; // 1→0
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 120); // пульс 0..1
        const cx = gameWidth / 2;
        const cy = gameHeight / 2;

        // Красный туман по краям (виньетка)
        const vignette = ctx.createRadialGradient(cx, cy, gameWidth * 0.2, cx, cy, gameWidth * 0.75);
        vignette.addColorStop(0, 'rgba(180,0,0,0)');
        vignette.addColorStop(1, `rgba(180,0,0,${0.35 * prog * (0.6 + pulse * 0.4)})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, gameWidth, gameHeight);

        // Пульсирующие концентрические круги
        for (let ring = 0; ring < 3; ring++) {
            const base = 60 + ring * 50;
            const r = base + pulse * 30;
            const alpha = (1 - ring * 0.25) * prog * (0.5 + pulse * 0.4);
            ctx.strokeStyle = `rgba(255,${30 - ring * 10},0,${alpha})`;
            ctx.lineWidth = 3 - ring;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Текст обратного отсчёта
        const secsLeft = Math.ceil(bossWarning / 1000);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${28 + pulse * 6}px Orbitron, Arial`;
        ctx.fillStyle = `rgba(255,60,0,${0.9 * prog})`;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 20 * pulse;
        ctx.fillText(`⚠ БОСС ЧЕРЕЗ ${secsLeft}с ⚠`, cx, cy);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    damageTexts.forEach(text => {
        ctx.fillStyle = text.color;
        ctx.globalAlpha = text.opacity;
        ctx.font = `${text.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(text.text, text.x, text.y);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1.0;
    });
    
    rewardTexts.forEach(text => {
        ctx.fillStyle = text.color;
        ctx.globalAlpha = text.opacity;
        ctx.font = `${text.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(text.text, text.x, text.y);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1.0;
    });
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 220, 90);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.fillText(`Оружие: ${currentWeapon.name}`, 20, 35);
    ctx.fillText(`Уровень: ${currentWeapon.level}/8`, 20, 55);
    ctx.fillText(`Деньги: $${money}`, 20, 75);
    ctx.fillText(`Ур. перс.: ${playerLevel}`, 20, 95);
    ctx.fillText(currentWeapon.icon, 180, 45);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(gameWidth - 210, 10, 200, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.fillText(`Счет: ${score}`, gameWidth - 200, 35);
    ctx.font = '16px Arial';
    ctx.fillText(`Убито: ${enemiesKilled}`, gameWidth - 200, 55);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(gameWidth/2 - 100, 10, 200, 30);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(gameWidth/2 - 98, 12, 196, 26);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(gameWidth/2 - 98, 12, 196 * (player.health / player.maxHealth), 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(`Здоровье: ${Math.max(0, Math.floor(player.health))}/${player.maxHealth}`, gameWidth/2 - 50, 30);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, gameHeight - 40, 200, 30);
    ctx.fillStyle = '#333366';
    ctx.fillRect(12, gameHeight - 38, 196, 26);
    ctx.fillStyle = '#4db8ff';
    ctx.fillRect(12, gameHeight - 38, 196 * (exp / expToNextWeapon), 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(`Опыт: ${exp}/${expToNextWeapon}`, 20, gameHeight - 20);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(gameWidth - 210, gameHeight - 40, 200, 30);
    ctx.fillStyle = '#663399';
    ctx.fillRect(gameWidth - 208, gameHeight - 38, 196, 26);
    ctx.fillStyle = '#9966ff';
    ctx.fillRect(gameWidth - 208, gameHeight - 38, 196 * (playerExp / expToNextLevel), 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(`Ур. перс.: ${playerExp}/${expToNextLevel}`, gameWidth - 200, gameHeight - 20);
    
    if (gamePaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, gameWidth, gameHeight);
        ctx.fillStyle = '#ffffff';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ПАУЗА', gameWidth/2, gameHeight/2);
        ctx.font = '24px Arial';
        ctx.fillText('Нажмите P для продолжения', gameWidth/2, gameHeight/2 + 50);
        ctx.textAlign = 'left';
    }
    
    if (player.health < player.maxHealth * 0.3) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(0, 0, gameWidth, gameHeight);
    }
}

// Игровой цикл
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Выбор режима игры
function startGame() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'none';
    document.getElementById('tutorial-screen').style.display = 'none';
    document.getElementById('game-container').classList.remove('hidden');
    updateCanvasSize();
    playMusic('game');
    restartGame();
}

function showMainMenu() {
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('settings-menu').style.display = 'none';
    document.getElementById('tutorial-screen').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'none';
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('game-win').classList.add('hidden');
    document.getElementById('pause-menu').style.display = 'none';
    gamePaused = false;
    playMusic('menu');
}

// Перезапуск игры
function restartGame() {
    player.x = gameWidth / 2 - player.width / 2;
    player.y = gameHeight / 2 - player.height / 2;
    player.speed = 2.5;
    player.health = 100;
    player.maxHealth = 100;
    
    playerLevel = 1;
    playerExp = 0;
    expToNextLevel = 100;
    skillPoints = 0;
    
    currentWeaponIndex = 0;
    currentWeapon = weapons[currentWeaponIndex];
    
    weaponUpgrades = {
        damage: {
            level: 1,
            maxLevel: 20,
            multiplier: 1.0,
            cost: 50,
            costMultiplier: 1.5
        },
        fireRate: {
            level: 1,
            maxLevel: 20,
            multiplier: 1.0,
            cost: 50,
            costMultiplier: 1.5
        },
        bulletSpeed: {
            level: 1,
            maxLevel: 15,
            multiplier: 1.0,
            cost: 50,
            costMultiplier: 1.5
        },
        bulletSize: {
            level: 1,
            maxLevel: 10,
            multiplier: 1.0,
            cost: 75,
            costMultiplier: 1.8
        },
        recoil: {
            level: 1,
            maxLevel: 5,
            multiplier: 1.0,
            cost: 100,
            costMultiplier: 2.0
        }
    };
    
    Object.keys(playerSkills).forEach(skill => {
        playerSkills[skill].level = 0;
        playerSkills[skill].apply();
    });
    
    currentWave = 1;
    enemiesInWave = 10;
    enemiesKilledInWave = 0;
    waveReward = 100;
    waveActive = true;
    enemySpawnRate = 1000;
    
    combo = 0;
    comboMultiplier = 1.0;
    lastKillTime = 0;
    
    autoShootActive = autoShootEnabled;
    rapidFireActive = true;
    rapidFireTimer = 0;
    
    damageTexts = [];
    rewardTexts = [];
    
    bullets = [];
    enemies = [];
    
    score = 0;
    exp = 0;
    money = 100;
    expToNextWeapon = weapons[currentWeaponIndex].upgradeExpCost;
    enemiesKilled = 0;
    
    gameOver = false;
    gameWin = false;
    gamePaused = false;
    weaponUpgradeReady = false;
    winShown = false;
    bossWarning = 0;
    
    achievementCounters.rapidFireActivations = 0;
    achievementCounters.tanksKilled = 0;
    achievementCounters.bossesKilled = 0;
    achievementCounters.damageTakenInWave = 0;
    
    // Сбрасываем миссии (но не достижения)
    missions.forEach(mission => {
        mission.current = 0;
        mission.completed = false;
    });
    
    updateWaveProgress();
    
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('game-win').classList.add('hidden');
    document.getElementById('pause-menu').style.display = 'none';
    document.getElementById('wave-stats').style.display = 'none';
    
    updateStats();
    updateMissions();
    
    showNotification(`Новая игра началась в режиме ${currentGameMode.name}! Удачи!`, "success", 2000);
}

// Полноэкранный режим
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Ошибка при включении полноэкранного режима: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Переключение вкладок
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// Обработчики событий
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;

    if (e.code === 'Space' && !gameOver && !gameWin && !gamePaused) {
        shoot(mouseX, mouseY);
        e.preventDefault();
    }

    if (e.code === 'KeyQ' && !gameOver && !gameWin && !gamePaused) {
        upgradeWeapon();
        e.preventDefault();
    }

    if (e.code === 'KeyP') {
        gamePaused = !gamePaused;
        closeAllModals();
        document.getElementById('pause-menu').style.display = gamePaused ? 'flex' : 'none';
        updateStats();
    }

    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (!gameOver && !gameWin && !gamePaused) activateRapidFire();
    }


    if (e.key === 'F11') {
        toggleFullscreen();
        e.preventDefault();
    }

    if (e.code === 'KeyR' && gamePaused) {
        restartGame();
    }

    if (e.key === 'Escape') {
        if (gameOver || gameWin) {
            document.getElementById('game-over').classList.add('hidden');
            document.getElementById('game-win').classList.add('hidden');
            showMainMenu();
        } else if (gamePaused) {
            document.getElementById('pause-menu').style.display = 'none';
            gamePaused = false;
            showMainMenu();
            document.getElementById('game-container').classList.add('hidden');
        } else {
            gamePaused = true;
            closeAllModals();
            document.getElementById('pause-menu').style.display = 'flex';
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Обработчики мыши
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        mouseDown = true;
        if (!gameOver && !gameWin && !gamePaused) {
            shoot(mouseX, mouseY);
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        mouseDown = false;
    }
});

canvas.addEventListener('mouseleave', () => {
    mouseDown = false;
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!gameOver && !gameWin && !gamePaused) upgradeWeapon();
});

// Модальные окна
function openModal(id) {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
});

document.getElementById('pause-stats-btn').addEventListener('click', () => openModal('modal-stats'));
document.getElementById('pause-upgrades-btn').addEventListener('click', () => openModal('modal-upgrades'));
document.getElementById('pause-skills-btn').addEventListener('click', () => openModal('modal-skills'));
document.getElementById('pause-missions-btn').addEventListener('click', () => openModal('modal-missions'));

function openPauseModal(modalId) {
    if (!gamePaused) {
        gamePaused = true;
        document.getElementById('pause-menu').style.display = 'flex';
        updateStats();
    }
    openModal(modalId);
}

document.getElementById('qbtn-menu').addEventListener('click', () => openPauseModal('modal-stats'));

// Обработчики кнопок
document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);

document.getElementById('shoot-btn').addEventListener('click', () => {
    if (!gameOver && !gameWin && !gamePaused) shoot(mouseX, mouseY);
});

autoShootButton = document.getElementById('auto-shoot-btn');
autoShootButton.addEventListener('click', toggleAutoShoot);

document.getElementById('upgrade-weapon-btn').addEventListener('click', upgradeWeapon);
document.getElementById('upgrade-weapon-btn-ctrl').addEventListener('click', upgradeWeapon);

document.getElementById('upgrade-damage-btn').addEventListener('click', upgradeDamage);
document.getElementById('upgrade-firerate-btn').addEventListener('click', upgradeFireRate);
document.getElementById('upgrade-bulletspeed-btn').addEventListener('click', upgradeBulletSpeed);
document.getElementById('upgrade-bulletsize-btn').addEventListener('click', upgradeBulletSize);
document.getElementById('upgrade-recoil-btn').addEventListener('click', upgradeRecoil);

document.getElementById('upgrade-vitality-btn').addEventListener('click', () => upgradeSkill('vitality'));
document.getElementById('upgrade-speed-btn').addEventListener('click', () => upgradeSkill('speed'));
document.getElementById('upgrade-regen-btn').addEventListener('click', () => upgradeSkill('regen'));
document.getElementById('upgrade-critical-btn').addEventListener('click', () => upgradeSkill('critical'));
document.getElementById('upgrade-greed-btn').addEventListener('click', () => upgradeSkill('greed'));
document.getElementById('upgrade-luck-btn').addEventListener('click', () => upgradeSkill('luck'));
document.getElementById('upgrade-combo-btn').addEventListener('click', () => upgradeSkill('combo'));
document.getElementById('upgrade-shield-btn').addEventListener('click', () => upgradeSkill('shield'));

document.getElementById('activate-rapid-btn').addEventListener('click', activateRapidFire);

document.getElementById('pause-btn').addEventListener('click', () => {
    gamePaused = !gamePaused;
    closeAllModals();
    document.getElementById('pause-menu').style.display = gamePaused ? 'flex' : 'none';
    updateStats();
});

document.getElementById('resume-btn').addEventListener('click', () => {
    gamePaused = false;
    closeAllModals();
    document.getElementById('pause-menu').style.display = 'none';
    updateStats();
});

document.getElementById('restart-pause-btn').addEventListener('click', () => { closeAllModals(); restartGame(); });
document.getElementById('restart-button').addEventListener('click', restartGame);

document.getElementById('continue-button').addEventListener('click', () => {
    gameWin = false;
    document.getElementById('game-win').classList.add('hidden');
});

document.getElementById('new-game-btn').addEventListener('click', restartGame);

document.getElementById('change-mode-btn').addEventListener('click', () => {
    gamePaused = false;
    closeAllModals();
    document.getElementById('pause-menu').style.display = 'none';
    document.getElementById('game-container').classList.add('hidden');
    showMainMenu();
});

document.getElementById('change-mode-button').addEventListener('click', () => {
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    showMainMenu();
});

document.getElementById('win-change-mode').addEventListener('click', () => {
    document.getElementById('game-win').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    showMainMenu();
});

// Главное меню → выбор режима
document.getElementById('new-game-menu-btn').addEventListener('click', () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('mode-select-screen').style.display = 'flex';
});

// Выбор режима → туториал
document.getElementById('mode-normal-btn').addEventListener('click', () => {
    currentGameMode = GAME_MODES.NORMAL;
    document.getElementById('mode-select-screen').style.display = 'none';
    document.getElementById('tutorial-screen').style.display = 'flex';
});

document.getElementById('mode-endless-btn').addEventListener('click', () => {
    currentGameMode = GAME_MODES.HARDCORE;
    document.getElementById('mode-select-screen').style.display = 'none';
    document.getElementById('tutorial-screen').style.display = 'flex';
});

document.getElementById('mode-back-btn').addEventListener('click', () => {
    document.getElementById('mode-select-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
});

// Туториал → игра
document.getElementById('tutorial-start-btn').addEventListener('click', () => {
    document.getElementById('tutorial-screen').style.display = 'none';
    startGame();
});
document.getElementById('settings-menu-btn').addEventListener('click', () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('settings-menu').style.display = 'flex';
});
document.getElementById('settings-back-btn').addEventListener('click', () => {
    document.getElementById('settings-menu').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
});

// Управление музыкой из настроек
const toggleMusicBtn = document.getElementById('toggle-music');
const musicVolumeSlider = document.getElementById('music-volume');
let musicEnabled = true;

toggleMusicBtn.addEventListener('click', () => {
    musicEnabled = !musicEnabled;
    toggleMusicBtn.textContent = musicEnabled ? 'ВКЛ' : 'ВЫКЛ';
    toggleMusicBtn.classList.toggle('active', musicEnabled);
    if (musicEnabled) {
        playMusic(document.getElementById('game-container').classList.contains('hidden') ? 'menu' : 'game');
    } else {
        audioMenu.pause();
        audioGame.pause();
    }
});

musicVolumeSlider.addEventListener('input', () => {
    const v = musicVolumeSlider.value / 100;
    audioMenu.volume = v;
    audioGame.volume = v * 0.8;
});

// Вкладки настроек
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('stab-' + tab.dataset.stab).classList.add('active');
    });
});

const toggleAutoshootBtn = document.getElementById('toggle-autoshoot');
toggleAutoshootBtn.addEventListener('click', () => {
    autoShootEnabled = !autoShootEnabled;
    autoShootActive = autoShootEnabled;
    toggleAutoshootBtn.textContent = autoShootEnabled ? 'ВКЛ' : 'ВЫКЛ';
    toggleAutoshootBtn.classList.toggle('active', autoShootEnabled);
});

let showCombo = true;
const toggleComboBtn = document.getElementById('toggle-combo');
toggleComboBtn.addEventListener('click', () => {
    showCombo = !showCombo;
    toggleComboBtn.textContent = showCombo ? 'ВКЛ' : 'ВЫКЛ';
    toggleComboBtn.classList.toggle('active', showCombo);
    if (!showCombo) document.getElementById('combo-display').style.display = 'none';
});

// Обработка изменения размера окна
window.addEventListener('resize', () => {
    updateCanvasSize();
    
    if (!gameOver && !gameWin) {
        player.x = Math.min(player.x, gameWidth - player.width);
        player.y = Math.min(player.y, gameHeight - player.height);
    }
});

document.addEventListener('fullscreenchange', () => {
    setTimeout(updateCanvasSize, 100);
});

// Инициализация
updateStats();
updateMissions();

// Показываем меню выбора режима при загрузке
showMainMenu();

// Музыка запускается при первом клике (keydown убран — переключал трек во время игры)
document.addEventListener('click', () => {
    const inMenu = document.getElementById('game-container').classList.contains('hidden');
    playMusic(inMenu ? 'menu' : 'game');
}, { once: true });

// Запуск игрового цикла
gameLoop();
