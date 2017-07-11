"use strict";

// Game state

const HEIGHT = 20;
const WIDTH = 10;
const EMPTY_TILE = 0;
const RED = 1;
const GREEN = 2;
const BLUE = 3;
const PURPLE = 4;
const FALL_TIME = 15; // frames to fall one block
const SWAP_TIME = 8;
const MATCH_VALUES = [
  // Start with 3
  300, // 3
  450, // 4
  650, // 5
  950, // 6
  1500, // 7
  2500, // 8
  4500, // 9
  7000, // 10
];
function matchValue(n) {
  if (n < 3) return 10;
  if (n > 10) return 7000 + 3000 * (n - 10);
  return MATCH_VALUES[n - 3];
}

class GameState {
  constructor() {
    this.score = 0;
    this.level = 0;
    this.bottomRow = 0;
    this.progress = 0;
    this.norma = 100;
    this.fallCount = 0;
    this.fallTick = 0;
    this.swapping = false;
    this.swapTick = 0;
    this.swapRow = 0;
    this.swapCol = 0;
    this.combo = 0;
    this.dead = false;
    this.fieldBuffer = new ArrayBuffer(HEIGHT * WIDTH);
    this.field = new Uint8Array(this.fieldBuffer);
    this.fallBuffer = new ArrayBuffer((HEIGHT - 1) * WIDTH);
    this.falling = new Uint8Array(this.fallBuffer);
    this.incBuffer = new ArrayBuffer(WIDTH);
    this.incoming = new Uint8Array(this.incBuffer);
    for (var i = 0; i < HEIGHT * WIDTH; ++i) {
      this.field[i] = EMPTY_TILE;
    }
    this.fillIncoming();
  }
  getAbsoluteRow(row) {
    return (row + this.bottomRow + HEIGHT) % HEIGHT;
  }
  getTile(row, col) {
    // row is from the bottom
    return this.field[this.getAbsoluteRow(row) * WIDTH + col];
  }
  setTile(row, col, val) {
    this.field[this.getAbsoluteRow(row) * WIDTH + col] = val;
  }
  randomTile() {
    return Math.floor(Math.random() * 4) + 1;
  }
  fillIncoming() {
    for (var i = 0; i < WIDTH; ++i) {
      this.incoming[i] = this.randomTile();
    }
  }
  horizontalFrom(row, col) {
    if (col == WIDTH - 1) return 1; // Sanity check
    var first = this.getTile(row, col);
    if (first == EMPTY_TILE) return 1;
    var col2;
    for (col2 = col + 1; col2 < WIDTH; ++col2) {
      var tile = this.getTile(row, col2);
      if (first != tile) return col2 - col;
    }
    return col2 - col;
  }
  verticalFrom(row, col) {
    if (row == HEIGHT - 1) return 1; // Sanity check
    var first = this.getTile(row, col);
    if (first == EMPTY_TILE) return 0; // Stop. Just stop.
    var row2;
    for (row2 = row + 1; row2 < HEIGHT; ++row2) {
      var tile = this.getTile(row2, col);
      if (first != tile) return row2 - row;
    }
    return row2 - row;
  }
  // Note that we can get things like a + shape.
  // This is why we don't erase the blocks yet.
  findMatches() {
    var matches = [];
    // Look for horizontal matches
    for (var row = 0; row < HEIGHT; ++row) {
      var col = 0;
      while (col < WIDTH) {
        var howMany = this.horizontalFrom(row, col);
        if (howMany >= 3) {
          matches.push([row, col, 0, howMany]);
        }
        col += howMany;
      }
    }
    // Vertical
    for (var col = 0; col < HEIGHT; ++col) {
      var row = 0;
      while (row < HEIGHT) {
        var howMany = this.verticalFrom(row, col);
        if (howMany >= 3) {
          matches.push([row, col, 1, howMany]);
        } else if (howMany == 0) break;
        row += howMany;
      }
    }
    return matches;
  }
  checkFalls() {
    for (var j = 1; j < HEIGHT; ++j) {
      for (var i = 0; i < WIDTH; ++i) {
        var tileno = this.getTile(j, i);
        if (tileno == EMPTY_TILE) continue;
        var btileno = this.getTile(j - 1, i);
        var suspended =
          (btileno == EMPTY_TILE) ||
          (j >= 2 && this.fallBuffer[WIDTH * (j - 2) + i] == 1);
        if (suspended) {
          // The tile above should fall.
          ++this.fallCount;
          this.fallBuffer[WIDTH * (j - 1) + i] = 1;
        } else {
          this.fallBuffer[WIDTH * (j - 1) + i] = 0;
        }
      }
    }
    // Initiate fall
    this.fallTick = 0;
  }
  processMatches() {
    var matches = this.findMatches();
    for (var match of matches) {
      if (match[2] == 0) {
        // horizontal
        for (var i = 0; i < match[3]; ++i)
          this.setTile(match[0], match[1] + i, EMPTY_TILE);
      } else if (match[2] == 1) {
        // vertical
        for (var i = 0; i < match[3]; ++i)
          this.setTile(match[0] + i, match[1], EMPTY_TILE);
      }
      // Award score
      this.score += Math.floor((1 + 0.1 * this.combo) * matchValue(match[3]));
      this.norma -= match[3];
    }
    this.checkFalls();
    return (matches.length != 0);
  }
  mouseToTileXY(x, y) {
    // Returns the position of the left tile.
    var tx = (x - 50) / 32;
    // sprite.y = (HEIGHT - j + offset) * 32
    var offset = -this.progress - 1;
    var ty = -(y - 30) / 32 + HEIGHT + offset;
    var txf;
    if (tx < 0 || tx >= WIDTH) txf = -1;
    else if (tx < 0.5) txf = 0;
    else if (tx >= WIDTH - 0.5) txf = WIDTH - 2;
    else txf = Math.floor(tx - 0.5);
    return [txf, Math.ceil(ty)];
  }
  tileToMouseXY(x, y) {
    var mx = 50 + 32 * x;
    var offset = -this.progress - 1;
    var my = 30 + (HEIGHT - y + offset) * 32;
    return [mx, my];
  }
  processClick() {
    if (this.swapping) return;
    var [x, y] = this.mouseToTileXY(mouseX, mouseY);
    // out of bounds check
    if (x < 0 || x >= WIDTH - 1 || y < 0 || y >= HEIGHT) return;
    var leftBlock = this.getTile(y, x);
    var rightBlock = this.getTile(y, x + 1);
    if (leftBlock == EMPTY_TILE && rightBlock == EMPTY_TILE) return;
    this.swapping = true;
    this.swapTick = 0;
    this.swapRow = y;
    this.swapCol = x;
    this.combo = 0;
  }
  advance() {
    if (this.bottomRow == 0) this.bottomRow = HEIGHT - 1;
    else --this.bottomRow;
    for (var i = 0; i < WIDTH; ++i) {
      if (this.getTile(0, i) != EMPTY_TILE) {
        this.dead = true;
        return;
      }
    }
    for (var i = 0; i < WIDTH; ++i) {
      this.setTile(0, i, this.incoming[i]);
    }
    this.fillIncoming();
    this.combo = 0;
  }
  tick() {
    // A single game tick.
    if (this.fallCount != 0) {
      // If blocks are still falling, don't advance the game.
      // Instead, wait for the blocks to finish falling.
      if (this.fallTick % FALL_TIME == 0 && this.fallTick != 0) {
        var distance = this.fallTick / FALL_TIME;
        for (var j = 1; j < HEIGHT; ++j) {
          for (var i = 0; i < WIDTH; ++i) {
            if (this.getTile(j, i) == EMPTY_TILE) continue;
            if (this.fallBuffer[(j - 1) * WIDTH + i] == 0) continue;
            // Is the block (distance + 1) blocks below occupied?
            // Alternatively, is the block at the bottom?
            var onGround =
              (j - distance == 0) ||
              (this.getTile(j - distance - 1, i) != EMPTY_TILE &&
                this.fallBuffer[(j - distance - 1) * WIDTH + i] == 0);
            if (onGround) {
              this.fallBuffer[(j - 1) * WIDTH + i] = 0;
              --this.fallCount;
              var tileno = this.getTile(j, i);
              this.setTile(j, i, EMPTY_TILE);
              this.setTile(j - distance, i, tileno);
            }
          }
        }
      }
      ++this.fallTick;
    }
    if (this.swapping) {
      ++this.swapTick;
      if (this.swapTick == SWAP_TIME) {
        this.swapping = false;
        var leftBlock = this.getTile(this.swapRow, this.swapCol);
        var rightBlock = this.getTile(this.swapRow, this.swapCol + 1);
        this.setTile(this.swapRow, this.swapCol, rightBlock);
        this.setTile(this.swapRow, this.swapCol + 1, leftBlock);
      }
    }
    if (!this.swapping && this.fallCount == 0) {
      this.progress += 1 / 120;
      if (this.progress >= 1) {
        this.progress -= 1;
        this.advance();
      }
      var matched = this.processMatches();
      if (matched) ++this.combo;
    } 
  }
  renderTiles(stage, tiles) {
    var offset = -this.progress - 1;
    stage.removeChildren();
    for (var j = 0; j < HEIGHT; ++j) {
      for (var i = 0; i < WIDTH; ++i) {
        var tileno = this.getTile(j, i);
        if (tileno == EMPTY_TILE) continue;
        var onGround =
          (j == 0) ||
          (this.fallBuffer[(j - 1) * WIDTH + i] == 0);
        var sprite = new Sprite(tiles[tileno - 1]);
        sprite.x = 32 * i;
        sprite.y = (HEIGHT - j + offset) * 32;
        if (!onGround) sprite.y += 32 * this.fallTick / FALL_TIME;
        if (this.swapping && j == this.swapRow) {
          var angle = Math.PI * this.swapTick / SWAP_TIME;
          if (i == this.swapCol) {
            // Left block
            sprite.x += 16 - 16 * Math.cos(angle);
            sprite.y -= 32 * Math.sin(angle);
          } else if (i == this.swapCol + 1) {
            sprite.x += -16 + 16 * Math.cos(angle);
            sprite.y += 32 * Math.sin(angle);
          }
        }
        stage.addChild(sprite);
      }
    }
    for (var i = 0; i < WIDTH; ++i) {
      var tileno = this.incoming[i];
      if (tileno == EMPTY_TILE) continue;
      var sprite = new Sprite(tiles[tileno - 1]);
      sprite.x = 32 * i;
      sprite.y = (HEIGHT + 1 + offset) * 32;
      stage.addChild(sprite);
    }
  }
}

// Aliases
var Container = PIXI.Container,
    Rectangle = PIXI.Rectangle,
    Texture = PIXI.Texture,
    TextureCache = PIXI.TextureCache,
    autoDetectRenderer = PIXI.autoDetectRenderer,
    ParticleContainer = PIXI.ParticleContainer,
    loader = PIXI.loader,
    resources = PIXI.loader.resources,
    Sprite = PIXI.Sprite,
    Text = PIXI.Text;

// Create the renderer
var renderer = autoDetectRenderer(1024, 768);
var view = renderer.view;

// Add the canvas to the HTML document
document.body.appendChild(view);

// Create a container object called the `stage`
var stage = new Container();

var imageFiles = [
  { name: "peanutButter", url: "peanutbutter.jpg" },
  { name: "tiles", url: "tiles.png" },
  { name: "stgframe", url: "stgframe.png" },
  { name: "selector", url: "selector.png" },
];

var tileLocations = [
  [0, 0, 32, 32],
  [32, 0, 64, 32],
  [64, 0, 96, 32],
  [96, 0, 128, 32],
];

var state;
var mouseX, mouseY;
view.onmousemove = function(e) {
  var rect = e.target.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
}
view.onclick = function (e) {
  var rect = e.target.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
  state.processClick();
}

function setup() {
  function loop() {
    requestAnimationFrame(loop);
    state.tick();
    state.renderTiles(tileStage, tiles);
    scoreText.text = "Score: " + state.score;
    scoreText.text += "\nLevel: " + state.level;
    scoreText.text += "\n(to next) " + state.norma;
    scoreText.text += "\nx" + state.combo;
    var [tx, ty] = state.mouseToTileXY(mouseX, mouseY);
    if (tx >= 0 && tx < WIDTH - 1 && ty >= 0 && ty < HEIGHT) {
      selector.visible = true;
      var [mx, my] = state.tileToMouseXY(tx, ty);
      selector.x = mx;
      selector.y = my;
    }
    renderer.render(stage);
  }
  
  var pb = new Sprite(
    resources["peanutButter"].texture
  );

  var tiles = tileLocations.map((val) => {
    var rectangle = new Rectangle(val[0], val[1], val[2] - val[0], val[3] - val[1]);
    var atile = new Texture(TextureCache["tiles"], rectangle);
    return atile;
  });

  var tileStage = new ParticleContainer(
    15000, 
    {
      rotation: false,
      alpha: true,
      scale: false,
      uvs: true
    }
  );
  tileStage.position.x = 50;
  tileStage.position.y = 30;
  stage.addChild(tileStage);

  var stgframe = new Sprite(resources["stgframe"].texture);
  stage.addChild(stgframe);

  var selector = new Sprite(resources["selector"].texture);
  stage.addChild(selector);
  selector.visible = false;

  var scoreText = new Text(
    "Score: 0",
    {fontFamily: "Liberation Mono", fontSize: 32, fill: "white"}
  );
  scoreText.x = 460;
  scoreText.y = 96;
  stage.addChild(scoreText);

  state = new GameState();

  loop();
}

// Add sprites
loader
  .add(imageFiles).load(setup);