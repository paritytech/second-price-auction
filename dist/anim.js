function setup() {
  let c = createCanvas(windowWidth, 320);
  c.parent('canvas-holder');
  fill(0, 0, 0);	// r, g, b
  SP = width / 24;
  d = SP * .75;
  noStroke();
}

function ease(p, g) {
  var pe = 3 * p * p - 2 * p * p * p;
  pe = 3 * pe * pe - 2 * pe * pe * pe;
  return 3 * pe * pe - 2 * pe * pe * pe;
}

var v = .0002;	// velocity!
var structure = 0;

var N = 16;
var x, y, sp, SP, d, t = 0,
  gt = 0;
var mn = Math.sqrt(3) / 2;

var ex = 0,
  ey = 0,
  tt, r;
var dd, hd, ph;
var rot;

var pt = 0;

function draw() {
  gt = v * millis();
  pt = t;
  t = gt % 1;
  sp = SP * pow(2, t);
  if (t < pt) {
    ex = random(-width / 2, width / 2);
    ey = random(-height / 2, height / 2);
  }

  background(255);

  structure = map(cos(TWO_PI * gt / 6), 1, -1, -1, 1);
  structure = ease(constrain(structure, 0, 1), 3);
  wl = map(cos(TWO_PI * gt / 7), 1, -1, .01, .04);

  push();
  translate(width / 2, height / 2);

  for (i = -N; i <= N; i++) {
    for (j = -N; j <= N; j++) {
      x = i * sp + 25;
      y = j * mn * sp - 20;
      if (j % 2 != 0)
        x += .5 * sp;

      if (abs(x) < width * .65 && abs(y) < height * .65) {
        r = dist(x, y, 0, 0);

        tt = constrain(5 * t - 0.0045 * dist(x, y, ex, ey), 0, 1);
        tt = ease(tt, 6);

        if (j % 2 == 0 && (i + Math.floor(j / 2)) % 2 == 0) // if on larger grid
          dd = d;
        else
          dd = d * tt;

        ph = cos(wl * x) * cos(wl * (.5 * x + mn * y)) * cos(wl * (.5 * x - mn * y));
        ph = constrain(ph, 0, 1);

        dd *= lerp(1 - structure, 1, ph);

        rot = 0.35 * structure * sin(4 * gt - .00175 * r);

        push();
        rotate(rot);
        ellipse(x, y, dd, dd);
        pop();
      }
    }
  }

  pop();
}
