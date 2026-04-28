const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('boardview.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;
console.log(document.getElementById('tt') !== null);
console.log(document.getElementById('comp-sidebar') !== null);
