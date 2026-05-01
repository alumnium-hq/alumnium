const done = arguments[arguments.length - 1];
const args = Array.from(arguments).slice(0, -1);
const symbol = Symbol.for("alumnium");

window[symbol]
  .waitForStability(...args)
  .then(done)
  .catch((err) => done(err.message));
