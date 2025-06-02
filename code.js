// TODO:
// sataisīt smuki input laukus

// expandables visp'ar
// d6 +d3 expandable
// tabulas
// 2 kolonnas līdz sm 

readUrlParams();

google.charts.load('current', {'packages':['corechart']});
window.chartData_wounds = [];
window.chartData_models = [];

recalculate();

document.getElementById('go_button').onclick = recalculate;
document.querySelectorAll('input, select').forEach(i => {
    
    updateDisplay(i);

    i.onchange = () => {
        checkRelatedInput(i);
        updateDisplay(i);
        setUrlParams();
    };
});

function recalculate() {
    try
    {
        setUrlParams();

        const weaponName = document.getElementById('weapon_title').value;
        const targetName = document.getElementById('target_title').value;

        document.title = `${weaponName} vs ${targetName}`;

        const skill = getIntInputValue('skill');
        const strength = getIntInputValue('strength');
        const armourPiercing = getIntInputValue('ap');        
        
        const toughness = getIntInputValue('toughness');
        const save = getIntInputValue('save');
        const invulnSave = getOptionalIntInputValue('invuln_save', 7);
        const woundsPerModel = getIntInputValue('wounds');
        const feelNoPain = getOptionalIntInputValue('feel_no_pain', 7);

        const anti = getOptionalIntInputValue('anti', 6);
        const critHit = getOptionalIntInputValue('crit_hit', 6);
        const hasDevastatingWounds = getBoolValue('dev_wounds');
        const hasLethalHits = getBoolValue('lethal_hits');
        const hasTorrent = getBoolValue('hasn_skill');
        const sustainedHits = getOptionalIntInputValue('sustained_hits');

        const hitModifier = getIntInputValue('hit_modifier');
        const hitReroll = getSelectValue('hit_reroll');
        const hitFishCrit = getBoolValue('hit_fish6');

        const woundModifier = getIntInputValue('wound_modifier');
        const woundReroll = getSelectValue('wound_reroll');
        const woundFishCrit = getBoolValue('wnd_fish6');

        const attacksFn = getD3D6FieldValueGenerator('attacks');
        const damageFn = getD3D6FieldValueGenerator('damage');
        
        const toWound = getToWoundValue(strength, toughness);

        const modifiedSave = save - armourPiercing;
        const effectiveSave = modifiedSave < invulnSave ? modifiedSave : invulnSave;

        const simulate = () => {
            const attacks = attacksFn();
            // torrent - all attacks hit but none can crit
            const hitRoll = hasTorrent 
                ? { fail: 0, pass: attacks, critical: 0 } 
                : rollDice(attacks, skill, hitReroll, hitFishCrit, hitModifier, critHit);

            let woundsToRoll = hitRoll.pass + (sustainedHits ? sustainedHits * hitRoll.critical : 0);
            let wounds = 0;

            if (hasLethalHits) {
                wounds += hitRoll.critical;
            } else {
                woundsToRoll += hitRoll.critical;
            }

            const woundRoll = rollDice(woundsToRoll, toWound, woundReroll, woundFishCrit, woundModifier, anti);

            const devastatingWounds = hasDevastatingWounds ? woundRoll.critical : 0;

            const savesToRoll = wounds + (woundRoll.pass + woundRoll.critical - devastatingWounds);

            // save rolls dont have the critical success on 6
            const saveRoll = rollDice(savesToRoll, effectiveSave, "", false, 0, effectiveSave);

            const damageRolls = saveRoll.fail + devastatingWounds;

            // TODO: applying the damage one model at a time
            const result = {
                wounds: 0,
                models: 0
            };

            for (let i = 0; i < damageRolls; i++) {
                let damage = damageFn();

                if (feelNoPain) {
                    damage = runFunctionNTimes(damage, () => getD6() >= feelNoPain ? 0 : 1);
                }

                result.wounds += damage;

                // any extra damage is overkill
                if (result.wounds >= woundsPerModel) {
                    result.models += 1;
                    result.wounds = 0;
                }
            }

            return result;
        };

        const a = new Date();
        const results = {};
        const runCount = 100000;
        for (let i = 0; i < runCount; i++) {
            const item = simulate();
            const key = `${item.wounds}_${item.models}`;
            results[key] = (results[key] || 0) + 1;
        }

        console.log(new Date() - a);

        const modelProbabilities = [];
        const woundProbabilities = [];

        const summary = Object.keys(results)
            .map(k => {
                const a = k.split('_');
                const wounds = parseInt(a[0]);
                const models = parseInt(a[1]);

                const probability = round(results[k] / runCount * 100, 3)
                const totalWounds = models * woundsPerModel + wounds;

                modelProbabilities[models] = (modelProbabilities[models] || 0) + probability;
                woundProbabilities[totalWounds] = (woundProbabilities[totalWounds] || 0) + probability;

                return { 
                    wounds: wounds,
                    models: models,
                    totalWounds: totalWounds,
                    probability: probability };
                })
            .sort((a, b) => b.probability - a.probability);
        
        fixArray(woundProbabilities);
        fixArray(modelProbabilities);            

        window.chartData_wounds = woundProbabilities.map((v, i) => [ i, v ]);
        window.chartData_models = modelProbabilities.map((v, i) => [ i, v ]);

        summary.forEach(i => console.log(`${i.wounds} wounds, ${i.models} models : ${i.probability} %`));

        google.charts.setOnLoadCallback(drawCharts);
    } 
    catch (err) {
        console.error(err);
    }
}

function fixArray(a) {
    for (let i = 0; i < a.length; i++){
        if (!a[i]) {
            a[i] = 0;
        }
    }
}

function drawCharts() {
    drawChart(window.chartData_wounds, 'woundChart', 'Wounds');
    drawChart(window.chartData_models, 'modelChart', 'Models');
}
/**
 * 
 * @param {Array<Array<number>>} data 
 * @param {string} containerId 
 * @param {string} title 
 */
function drawChart(data, containerId, title) {
    const container = document.getElementById(containerId);
    if (data.length == 0) {
        data = [ 0, 100 ];
    }
    // Create the data table.
    let dataTable = new google.visualization.DataTable();
    dataTable.addColumn('number', title);
    dataTable.addColumn('number', 'Probability');
    dataTable.addColumn('number', 'Cumulative');

    data = data.sort((a, b) => a[0] - b[0]);
    for (let i = data.length - 1; i >=0; i--) {
        data[i][2] = (data[i + 1] || [ 0,0,0 ])[2] + data[i][1];
    }
    dataTable.addRows(data);

    // Set chart options
    let options = {
        title: title,
        legend: {position: 'none' },
        seriesType: 'bars',
        series: { 1: { type: 'line' } }
    };

    // Instantiate and draw our chart, passing in some options.
    let chart = new google.visualization.ComboChart(container);
    chart.draw(dataTable, options);
}

/**
 * @param {number} n
 * @param {number} toPass
 * @param {'1' | 'all' | null} rerollType 
 * @param {bool} fishForCrits
 * @param {number} modifier
 * @param {number} critical
 * @returns {DiceRolls}
 */
function rollDice(n, toPass, rerollType, fishForCrits = false, modifier = 0, critical = 6) {
    const result = {
        fail: 0,
        pass: 0,
        critical: 0
    };

    for (let i= 0; i < n; i++) {
        const roll = rollSingleDie(toPass, rerollType, fishForCrits, modifier, critical);

        result.fail += roll.fail || 0;
        result.pass += roll.pass || 0;
        result.critical += roll.critical || 0;
    }

    return result;
}

/**
 * @param {number} toPass
 * @param {'1' | 'all' | null} rerollType 
 * @param {bool} fishForCrits
 * @param {number} modifier
 * @param {number} critical
 * @returns {DiceRolls}
 */
function rollSingleDie(toPass, rerollType, fishForCrits = false, modifier = 0, critical = 6) {
    const roll = getD6();

    if (roll >= critical) {
        // natural crit
        return { critical: 1 };
    }

    if (fishForCrits && rerollType == 'all') {
        // was not crit, reroll
        return rollSingleDie(toPass, null, false, modifier, critical);
    }

    if (roll == 1) {
        if (rerollType == '1' || rerollType == 'all') { 
            return rollSingleDie(toPass, null, false, modifier, critical);
        } else {
            // always fails
            return { fail: 1 };
        }
    }

    if (roll + modifier >= toPass) {
        return { pass: 1 };
    }

    if (rerollType == 'all') {
        // was not 1, was not a pass, reroll
        return rollSingleDie(toPass, null, false, modifier, critical);
    }

    return { fail: 1 };
}

function getD6() {
    return Math.ceil(Math.random() * 6);
}

function getD3() {
    return Math.ceil(Math.random() * 3);
}

function getToWoundValue(strength, toughness) {
    const ratio = toughness / strength;

    if (ratio >= 2) {
        return 6;
    } else if (ratio > 1) {
        return 5;
    } else if (ratio == 1) {
        return 4;
    } else if (ratio > 0.5) {
        return 3;
    }

    return 2;
}

function getD3D6FieldValueGenerator(fieldName) {
    const constPart = getIntInputValue(fieldName);
    const d6Part = getIntInputValue(fieldName + '_d6');
    const d3Part = getIntInputValue(fieldName + '_d3');
    return () => constPart + d6Part * getD6() + d3Part * getD3();
}

function runFunctionNTimes(n, fn) {
    let sum = 0;
    for(let i = 0; i < n; i ++) {
        sum += fn();
    }
    return sum;
}

/**
 * @param input {HTMLInputElement} 
 * @param params {URLSearchParams}
 * */
function setIntInput(input, params) {
    const paramName = getParamNameAttribute(input);
    const paramValue = paramName && params.get(paramName) || getDefaultValue(input);
    input.value = parseInt(paramValue);
}

/**
 * @param input {HTMLInputElement} 
 * @param params {URLSearchParams}
 * */
function setStringInput(input, params) {
    const paramName = getParamNameAttribute(input);
    const paramValue = paramName && params.get(paramName) || getDefaultValue(input);
    input.value = paramValue;
}

/**
 * @param select {HTMLSelectElement} 
 * @param params {URLSearchParams}
 * */
function setSelect(select, params) {
    const paramName = getParamNameAttribute(select);
    const paramValue = paramName && params.get(paramName) || getDefaultValue(select);
    select.value = paramValue;
}

/**
 * 
 * @param {HTMLInputElement} input 
 * @param {URLSearchParams} params 
 */
function setCheckbox(input, params) {
    const paramName = getParamNameAttribute(input);
    const paramValue = paramName && params.get(paramName) || getDefaultValue(input);
    input.checked = !!paramValue;

    checkRelatedInput(input);
}

/**
 * @param element {HTMLElement} 
 * */
function getParamNameAttribute(element) {
    return element.getAttribute('url-param');
}

/**
 * @param element {HTMLElement} 
 * */
function getDefaultValue(element) {
    return element.getAttribute('default-value');
}

function getIntInputValue(id) {
    const input = document.getElementById(id);
    return parseInt(input && input.value);
}

function getOptionalIntInputValue(id, defaultValue) {
    const hasElement = document.getElementById('has_' + id);
    if (hasElement && !hasElement.checked) {
        return defaultValue;
    }
    
    return getIntInputValue(id);
}

function getSelectValue(id) {
    const input = document.getElementById(id);
    return input && input.value;
}

function getBoolValue(id) {
    const input = document.getElementById(id);
    return input && input.checked;
}

function round(n, d = digits) {
    const factor = Math.pow(10, d);
    return Math.round(n * factor) / factor;
}

function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    document.querySelectorAll('input[type=number]').forEach(input => setIntInput(input, params));
    document.querySelectorAll('input[type=text]').forEach(input => setStringInput(input, params));
    document.querySelectorAll('input[type=checkbox]').forEach(input => setCheckbox(input, params));
    document.querySelectorAll('select').forEach(input => setSelect(input, params));
}

function setUrlParams() {
    const params = new URLSearchParams(window.location.search);
    document.querySelectorAll('input, select').forEach(input => {
        const paramName = getParamNameAttribute(input)
        if (paramName) {
            let value = input.value;

            if (input.type == 'checkbox') {
                value = input.checked ? 'y' : null;
            }
            
            if (value !== getDefaultValue(input)){
                params.set(paramName, value);
            } else {
                params.delete(paramName);
            }
        }
    });

    const path = location.href.split('?')[0] + '?' + params.toString();
    window.history.pushState(path, document.title, path);
}

/**
 * Check if the related element should be enabled or disabled
 * @param {HTMLInputElement} input 
 */
function checkRelatedInput(input) {
    const id = input.id;
    const has = id.startsWith('has_');
    const hasnt = id.startsWith('hasn_');

    if (has || hasnt) {
        const prefixLen = has ? 4 : 5;
        const relatedElement = document.getElementById(input.id.substring(prefixLen));
        if (relatedElement) {
            relatedElement.disabled = has ? !input.checked : input.checked;
        }
    }
}

/**
 * Update a display field if such exists
 * @param {HTMLInputElement} input 
 */
function updateDisplay(input) {
    const id = input.id.split('_')[0];

    const display = document.getElementById(id + '_display');
    if (display) {
        const constPart = getIntInputValue(id);
        const d6Part = getIntInputValue(id + '_d6');
        const d3Part = getIntInputValue(id + '_d3');

        const out = [];
        if (constPart) {
            out.push(constPart+'');
        }
        if (d6Part) {
            const part = d6Part > 1 ? d6Part : '';
            out.push(part+'D6');
        }

        if (d3Part) {
            const part = d3Part > 1 ? d3Part : '';
            out.push(part+'D3');
        }

        display.innerText = out.join('+');
    }
}

/**
 * @typedef DiceRolls
 * @property {number} fail
 * @property {number} pass 
 * @property {number} critical
 */
