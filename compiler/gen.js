const fs = require("fs").promises;
const assert = require("assert")
const lexical = require('./lexical')

async function generateCircuit(regex, circuitPath = './') {
    const graph_json = lexical.compile(regex)
    const N = graph_json.length;

    // Outgoing nodes
    const graph = Array.from({
        length: N
    }, () => ({}));
    // Incoming Nodes
    const rev_graph = Array.from({
        length: N
    }, () => []);
    const accept_nodes = new Set();

    for (let i = 0; i < N; i++) {
        for (let k in graph_json[i]["edges"]) {
            //assert len(k) == 1
            //assert ord(k) < 128
            const v = graph_json[i]["edges"][k];
            graph[i][k] = v;
            rev_graph[v].push([k, i]);
        }
        if (graph_json[i]["type"] === "accept") {
            accept_nodes.add(i);
        }
    }

    assert.strictEqual(accept_nodes.size, 1);

    let eq_i = 0;
    let lt_i = 0;
    let and_i = 0;
    let multi_or_i = 0;

    let lines = [];
    lines.push("for (var i = 0; i < num_bytes; i++) {");

    assert.strictEqual(accept_nodes.has(0), false);

    for (let i = 1; i < N; i++) {
        const outputs = [];
        for (let [k, prev_i] of rev_graph[i]) {
            let vals = new Set(JSON.parse(k));
            const eq_outputs = [];

            const uppercase = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
            const lowercase = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
            const digits = new Set("0123456789".split(""));

            if (new Set([...uppercase].filter((x) => vals.has(x))).size === uppercase.size) {
                vals = new Set([...vals].filter((x) => !uppercase.has(x)));
                lines.push(`\tlt[${lt_i}][i] = LessThan(8);`);
                lines.push(`\tlt[${lt_i}][i].in[0] <== 64;`);
                lines.push(`\tlt[${lt_i}][i].in[1] <== in[i];`);

                lines.push(`\tlt[${lt_i + 1}][i] = LessThan(8);`);
                lines.push(`\tlt[${lt_i + 1}][i].in[0] <== in[i];`);
                lines.push(`\tlt[${lt_i + 1}][i].in[1] <== 91;`);

                lines.push(`\tand[${and_i}][i] = AND();`);
                lines.push(`\tand[${and_i}][i].a <== lt[${lt_i}][i].out;`);
                lines.push(`\tand[${and_i}][i].b <== lt[${lt_i + 1}][i].out;`);

                eq_outputs.push(["and", and_i]);
                lt_i += 2;
                and_i += 1;
            }
            if (new Set([...lowercase].filter((x) => vals.has(x))).size === lowercase.size) {
                vals = new Set([...vals].filter((x) => !lowercase.has(x)));
                lines.push(`\tlt[${lt_i}][i] = LessThan(8);`);
                lines.push(`\tlt[${lt_i}][i].in[0] <== 96;`);
                lines.push(`\tlt[${lt_i}][i].in[1] <== in[i];`);

                lines.push(`\tlt[${lt_i + 1}][i] = LessThan(8);`);
                lines.push(`\tlt[${lt_i + 1}][i].in[0] <== in[i];`);
                lines.push(`\tlt[${lt_i + 1}][i].in[1] <== 123;`);

                lines.push(`\tand[${and_i}][i] = AND();`);
                lines.push(`\tand[${and_i}][i].a <== lt[${lt_i}][i].out;`);
                lines.push(`\tand[${and_i}][i].b <== lt[${lt_i + 1}][i].out;`);

                eq_outputs.push(["and", and_i]);
                lt_i += 2;
                and_i += 1;
            }
            if (new Set([...digits].filter((x) => vals.has(x))).size === digits.size) {
                vals = new Set([...vals].filter((x) => !digits.has(x)));
                lines.push(`\tlt[${lt_i}][i] = LessThan(8);`);
                lines.push(`\tlt[${lt_i}][i].in[0] <== 47;`);
                lines.push(`\tlt[${lt_i}][i].in[1] <== in[i];`);

                lines.push(`\tlt[${lt_i + 1}][i] = LessThan(8);`);
                lines.push(`\tlt[${lt_i + 1}][i].in[0] <== in[i];`);
                lines.push(`\tlt[${lt_i + 1}][i].in[1] <== 58;`);

                lines.push(`\tand[${and_i}][i] = AND();`);
                lines.push(`\tand[${and_i}][i].a <== lt[${lt_i}][i].out;`);
                lines.push(`\tand[${and_i}][i].b <== lt[${lt_i + 1}][i].out;`);

                eq_outputs.push(["and", and_i]);
                lt_i += 2;
                and_i += 1;
            }
            for (let c of vals) {
                assert.strictEqual(c.length, 1);
                lines.push(`\teq[${eq_i}][i] = IsEqual();`);
                lines.push(`\teq[${eq_i}][i].in[0] <== in[i];`);
                lines.push(`\teq[${eq_i}][i].in[1] <== ${c.charCodeAt(0)};`);
                eq_outputs.push(["eq", eq_i]);
                eq_i += 1;
            }
            
            lines.push(`\tand[${and_i}][i] = AND();`);
            lines.push(`\tand[${and_i}][i].a <== states[i][${prev_i}];`);

            if (eq_outputs.length === 1) {
                lines.push(`\tand[${and_i}][i].b <== ${eq_outputs[0][0]}[${eq_outputs[0][1]}][i].out;`);
            } else if (eq_outputs.length > 1) {
                lines.push(`\tmulti_or[${multi_or_i}][i] = MultiOR(${eq_outputs.length});`);
                for (let output_i = 0; output_i < eq_outputs.length; output_i++) {
                    lines.push(`\tmulti_or[${multi_or_i}][i].in[${output_i}] <== ${eq_outputs[output_i][0]}[${eq_outputs[output_i][1]}][i].out;`);
                }
                lines.push(`\tand[${and_i}][i].b <== multi_or[${multi_or_i}][i].out;`);
                multi_or_i += 1;
            }
            outputs.push(and_i);
            and_i += 1;
        }

        if (outputs.length === 1) {
            lines.push(`\tstates[i+1][${i}] <== and[${outputs[0]}][i].out;`);
        } else if (outputs.length > 1) {
            lines.push(`\tmulti_or[${multi_or_i}][i] = MultiOR(${outputs.length});`);
            for (let output_i = 0; output_i < outputs.length; output_i++) {
                lines.push(`\tmulti_or[${multi_or_i}][i].in[${output_i}] <== and[${outputs[output_i]}][i].out;`);
            }
            lines.push(`\tstates[i+1][${i}] <== multi_or[${multi_or_i}][i].out;`);
            multi_or_i += 1;
        }
    }

    lines.push("}");

    let declarations = [];

    if (eq_i > 0) {
        declarations.push(`component eq[${eq_i}][num_bytes];`);
    }
    if (lt_i > 0) {
        declarations.push(`component lt[${lt_i}][num_bytes];`);
    }
    if (and_i > 0) {
        declarations.push(`component and[${and_i}][num_bytes];`);
    }
    if (multi_or_i > 0) {
        declarations.push(`component multi_or[${multi_or_i}][num_bytes];`);
    }
    declarations.push(`signal states[num_bytes+1][${N}];`);
    declarations.push("");

    let init_code = [];

    init_code.push("for (var i = 0; i < num_bytes; i++) {");
    init_code.push("\tstates[i][0] <== 1;");
    init_code.push("}");

    init_code.push(`for (var i = 1; i < ${N}; i++) {`);
    init_code.push("\tstates[0][i] <== 0;");
    init_code.push("}");

    init_code.push("");

    lines = [...declarations, ...init_code, ...lines];

    try {
        let tpl = await (await fs.readFile(`${__dirname}/tpl.circom`)).toString()
        tpl = tpl.replace('TEMPLATE_NAME_PLACEHOLDER', 'Regex')
        tpl = tpl.replace('COMPILED_CONTENT_PLACEHOLDER', lines.join('\n\t'))
        tpl = tpl.replace(/CIRCUIT_FOLDER/g, circuitPath)
        tpl = tpl.replace(/\t/g, ' '.repeat(4))
    
        await fs.writeFile('test/circuits/regex_compiler.circom', tpl);
    } catch (error) {
        console.log(error)
    }
}


module.exports = {
    generateCircuit,
    ...lexical
}
