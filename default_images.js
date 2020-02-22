let exampleDiagrams = [
  `(rect 0 0 canvas-width canvas-height (fill: "black"))

(def (circle-layer n size col1 col2)
  (for i 0 (< i n) (++ i)
       (circle (r: (* (random) size))
               (stroke: (stroke-style (width: 0)))
               (fill: (color-from-scale
                       (random)
                       col1 0
                       col2 1)))))

(def (arrow-layer n w col1 col2)
  (for i 0 (< i n) (++ i)
     (c-arrow
      (stroke: (stroke-style (width: (* (random) w))
                             (color:
                              (color-from-scale
                               (random)
                               col1 0
                               col2 1)))))))

(circle-layer 25 300 "#000022" "#110044")
(arrow-layer 70 2 "#000000" "#202020")
(circle-layer 25 150 "#110044" "#550055")
(arrow-layer 70 1 "#202020" "#606060")
(circle-layer 25 75 "#550055" "#ff0000")`,

`(def (rand-apply f n)
  (for i 0 (< i n) (++ i)
       (f (rand-x) (rand-y))))

(def (grid-apply f int)
  (for x 0 (< x canvas-width) (+ x int)
       (for y 0 (< y canvas-height) (+ y int)
            (f x y))))

(rect 0 0 canvas-width canvas-height (fill: "black"))

(rand-apply
 (! (x y)
    (let s (* (random) 100))
    (let hs (/ s 2))
    (rect (- x hs) (- y hs) s s no-stroke
          (color-from-scale (random)
                            "#330011" 0
                            "#000004" 1)))
 500)


(let incr (/ 360 120))
(let innerr 100)
(let outerr 200)
(let mid (coord (/ canvas-width 2) (/ canvas-height 2)))
(let iv (vector innerr 0))
(let ov (vector outerr 0))
(for a 0 (< a 360) (+ a incr)
     (curve (coord+vect mid (ov 'rotated a))
            (coord+vect mid (ov 'rotated (+ a incr)))
            (stroke: (stroke-style (color: "red"))))
     (curve
      (coord+vect mid (iv 'rotated a))
      (coord+vect mid (ov 'rotated a))
      (stroke: (stroke-style (width: (* (random) 4))
                             (color-from-scale (random)
                                               "#00ff00" 0
                                               "#339900" 1)))))


(circle (x-of mid) (y-of mid) innerr (fill: "black"))`,

`(def (rand-apply f n)
  (for i 0 (< i n) (++ i)
       (f (rand-x) (rand-y))))

(let mid (coord (/ canvas-width 2) (/ canvas-height 2)))

(rect 0 0 canvas-width canvas-height (fill: "black"))

(let ilim (/ canvas-width 3.5))
(for i ilim (> i 10) (* i 0.97)
     (ellipse (x-of mid) (y-of mid)
              i
              (* i 1.4)
              0
             no-stroke
             (color-from-scale
              (/ i ilim)
              "#3333ff" 0
              "#000000" 1)))


(rand-apply
 (! (x y)
    (let s (coord x y))
    (let d (pow (distance s mid) 0.9))
    (let uv ((points->vect mid s) 'norm))
    (let a (uv 'angle))
    (let e1 (coord+vect mid (uv '* d)))
    (curve mid e1
           (stroke:
            (stroke-style (width: 2)
                          (color: (color-from-scale (random)
                                                    "#0000ff" 0
                                                    "#000044" 1)))))
    (lseg e1 s (stroke:
                (stroke-style (color: "#ffaa66")))))
 100)

(rand-apply
 (! (x y)
    (let s (coord x y))
    (let d (pow (distance s mid) 0.5))
    (let uv ((points->vect mid s) 'norm))
    (let a (uv 'angle))
    (let e1 (coord+vect mid (uv '* d)))
    (curve mid e1
           (stroke:
            (stroke-style (width: 2)
                          (color: (color-from-scale (random)
                                                    "#ffff00" 0
                                                    "#ff0000" 1))))))
 100)`,

 `(def (rand-apply f n)
  (for i 0 (< i n) (++ i)
       (f (rand-x) (rand-y))))

(def (gen-list s nextf ef)
  (def (listmaker c l)
    (if (ef c)
      (begin
       (let next (nextf c))
       (listmaker next (append l next)))
      l))
  (listmaker s '()))

(let mid (coord (/ canvas-width 2) (/ canvas-height 2)))

(rect 0 0 canvas-width canvas-height (fill: "black"))

(let gsize 70)

(let ylist (cons 0 (gen-list 0 (! x (+ x (* (random) gsize)))
                     (! x (< x canvas-height)))))

(let xlist (cons 0(gen-list 0 (! x (+ x (* (random) gsize)))
                     (! x (< x canvas-width)))))

(let cl
     (map (! x
             (map (! y
                     (coord x y))
                  ylist))
          xlist))

(for-each subl cl
          (for-each ci subl
                    (circle (x-of ci) (y-of ci) 1 (fill: "white"))))

(def (rand-from l)
  (let i (floor (* (random) (length l))))
  (nth l i))

(def (ijth l i j)
  (nth (nth l i) j))

(def (jiggle point)
  (coord+vect point (vector (- (* (random) rsize) (/ rsize 2))
                            (- (* (random) rsize) (/ rsize 2)))))

(let rsize 10)
(let ilim (- (length cl) 1))
(let jlim (- (length (nth cl 0)) 1))

(let pointl (list))
(for i 0 (< i ilim) (++ i)
     (for j 0 (< j jlim) (++ j)
          (set pointl (list (ijth cl i j)
                            (ijth cl (+ i 1) j)
                            (ijth cl (+ i 1) (+ j 1))
                            (ijth cl i (+ j 1))))
          (polygon (map jiggle pointl)
                   (fill:
                    (color-from-scale
                     (random)
                     "#009900" 0
                     "#113300" 1)))))

(def (rand-between a b)
  (+ a (* (random) (- b a))))

(def (rbranch n loc ang r w col1 col2 ss)
  (if (> n 0)
    (begin
     (let eloc (coord+vect loc
                            (mag/dir->vect r ang)))
     (curve loc eloc (s-size: ss)
            (stroke:
             (stroke-style (width: w) col1)))
     (if (= n 1)
       (ellipse (x-of eloc) (y-of eloc) 10 5 ang (fill: "yellow")))
     (for i 0 (< i 3) (++ i)
       (rbranch (-- n) eloc (+ ang (rand-from (list 45 (ng 45))))
                (* r (rand-between 0.6 0.9))
                (* w (rand-between 0.6 0.8))
                (color-from-scale 0.2 col1 0 col2 1) col2 (+ ss 1.5)
                )))
    #t))


(rbranch 6 (coord (x-of mid) (- canvas-height 200)) -90 150 12 "#ff0000" "#ffff00" 0)`,

`(def (rand-apply f n)
  (for i 0 (< i n) (++ i)
       (f (rand-x) (rand-y))))

(def (gen-list s nextf ef)
  (def (listmaker c l)
    (if (ef c)
      (begin
       (let next (nextf c))
       (listmaker next (append l next)))
      l))
  (listmaker s '()))

(def (rand-from l)
  (let i (floor (* (random) (length l))))
  (nth l i))

(rect 0 0 canvas-width canvas-height (fill: "black"))

(def (rvect size)
  (vector (- (* (random) size) (/ size 2))
          (- (* (random) size) (/ size 2))))

(let clist (list "red" "orange" "yellow" "green" "blue" "purple"))

(def (triangle-trail clist n size start end)
  (let rp (rand-point))
  (let b (rand-point))
  (let c (rand-point))
  (let tlist (list))
  (let tlist2 (list))
  (let tlist3 (list))
  (let f 0)
  (let x0 (x-of start))
  (let y0 (y-of start))
  (let x1 (x-of end))
  (let y1 (y-of end))
  (for i 0 (< i (+ n 2)) (++ i)
       (set f (/ i n))
       (set rp (coord
                (+ x0 (* f (- x1 x0)))
                (+ y0 (* f (- y1 y0)))))
       (set rp (coord+vect rp (rvect size)))
       (set b (coord+vect rp (rvect size)))
       (set c (coord+vect rp (rvect size)))
       (set tlist (append tlist rp))
       (set tlist2 (append tlist2 b))
       (set tlist3 (append tlist3 c))
       (polygon (list rp b c)
                (fill: (rand-from clist))))
  (def (path-draw tl col)
    (for i 0 (< i (- (length tl) 1)) (++ i)
         (lseg (nth tl i) (nth tl (++ i))
               (stroke: (stroke-style (color: col)
                                      (style: "solid"))))))
    (path-draw tlist (rand-from clist))
    (path-draw tlist2 (rand-from clist))
    (path-draw tlist3 (rand-from clist)))

(let n0 20)
(let size0 100)

(triangle-trail (list "yellow" "red") n0 size0
                (coord (/ canvas-width 4) canvas-height)
                (coord (/ canvas-width 2) (/ canvas-height 2)))

(triangle-trail (list "blue" "green") n0 size0
                (coord (* 3 (/ canvas-width 4)) canvas-height)
                (coord (/ canvas-width 2) (/ canvas-height 2)))

(triangle-trail (list "yellow" "red") n0 size0
                (coord (/ canvas-width 4) 0)
                (coord (/ canvas-width 2) (/ canvas-height 2)))

(triangle-trail (list "blue" "green") n0 size0
                (coord (* 3 (/ canvas-width 4)) 0)
                (coord (/ canvas-width 2) (/ canvas-height 2)))`,

`(let mid (coord (/ canvas-width 2) (/ canvas-height 2)))
(let end (coord+vect mid (vector (* (random) 100) (* (random) 100))))

(circle (x-of mid) (y-of mid) 5 (fill: "black"))

(arrow mid end (stroke-style (width: 4)))

(tex "\\hat{\\boldsymbol{s}}"
     (coord+vect end ((points->vect mid end) '* 0.2)))

(let l (line-from-points
        mid end (stroke: (stroke-style (style: "dotted")))))

(let fend (rand-point))

(tex "\\boldsymbol{F}" (coord+vect fend ((points->vect mid fend) '* 0.2)))

(arrow mid fend (stroke-style (width: 4) (color: "red")))

(let w (((points->vect mid end) 'norm) 'dot (points->vect mid fend)))

(let wlend (coord+vect
            mid
            (mag/dir->vect w (l 'angle))))

(let wl
     (lseg mid
           wlend
           (stroke-style (style: "dashed") (width: 3) (color: "blue"))))

(lseg wlend fend (stroke: (stroke-style (style: "dotted"))))`,

`(group charge x y q)

(let charges (list
              (charge 400 400 1000)
              (charge 400 200 -1000)))

(def (evect x y)
  (accumulate
   (map
    (! c
       (let cloc (coord (c 'x) (c 'y)))
       (let loc (coord x y))
       (if (= 0 (distance cloc loc))
         (vector 0 0 0)
         ((points->vect cloc loc)
          '* (* (c 'q) (/ 1 (pow (distance cloc loc) 2.2))))))
    charges)
   (! (v1 v2) (v1 '+ v2))
   (vector 0 0 0)))

(def (rand-apply f n)
  (for i 0 (< i n) (++ i)
       (f (rand-x) (rand-y))))

(def (grid-apply f int)
  (for x 0 (< x canvas-width) (+ x int)
       (for y 0 (< y canvas-height) (+ y int)
            (f x y))))

(grid-apply
 (! (x y)
    (let start (coord x y))
    (let end (coord+vect (coord x y)
                       (evect x y)))
    (if (> (distance start end) 50)
      #f
      (arrow start end
             (stroke: (stroke-style (color: "black")))
             )))
 26)


(map (! c
        (circle (c 'x) (c 'y) 10
                (fill: (if (> 0 (c 'q)) "red" "blue"))))
     charges)`,

`(let a (coord 100 100))
(let b (coord 400 400))
(let x (coord 100 300))

(text "A" (over a 30))
(text "B" (under b 30))
(text "X" (left-of x 30))

(let ss (stroke-style (width: 2) (color: "red")))

(c-arrow a (right-of b 4) -45 45 (stroke: ss))

(c-arrow a (over x 4) 135 90 (s-size: 70) (stroke: ss))

(c-arrow x (under b 4) -45 200 (stroke: ss))

(map (! c
        (circle (x-of c) (y-of c) 4 (fill: "black")))
     (list a b x))`,

`(let thick-str (stroke-style (width: 3)))
(let dotted (stroke-style (style: "dotted")))

(let o (circle 300 300 (stroke: thick-str) (fill: "green")))
(let t1 (o 'tangent))
((t1 'draw) dotted)
(let t2 (o 'tangent))
((t2 'draw) dotted)

(let intersect (t1 'intersect t2))
(let d (- ((points->vect intersect (o 'center)) 'mag) (o 'r)))
(let oi (circle (x-of intersect) (y-of intersect) d
                (stroke: thick-str)
                (fill: "red")))`,

`(let ws (stroke-style 2 "black"))

(def (resistor p1 p2 s)
  (rep s 10)
  (let corner (left-of p1 s))
  (rect (x-of corner) (y-of corner) (* s 2) (distance p1 p2)))

(def (mosfet point s)
  (rep s 40)
  (lseg point (under point 40))
  (let ch (/ s 5))
  (let p2 (right-of point 10))
  (let a1 p2) (let a2 (under p2 ch))
  (let b1 (under a2 ch)) (let b2 (under b1 ch))
  (let c1 (under b2 ch)) (let c2 (under c1 ch))
  (lseg a1 a2)
  (lseg b1 b2)
  (lseg c1 c2)
  (let ax (average-of-coords (list a1 a2)))
  (let bx (average-of-coords (list b1 b2)))
  (let cx (average-of-coords (list c1 c2)))
  (lseg ax (right-of ax 10))
  (lseg bx (right-of bx 10))
  (lseg cx (right-of cx 10))
  (lseg (right-of bx 10) (under (right-of cx 10) 10))
  (lseg (under point 40) (left-of (under point 40) 20))
  (circle (x-of point) (y-of (under point (/ s 2))) (/ s 1.4))
  (! arg
     (cond ((= arg 'in)
            (left-of (under point 40) 20))
       ((= arg 's)
        (under (right-of cx 10) 10))
       ((= arg 'd)
        (right-of ax 10)))))

(let m (mosfet (coord 400 400)))

(lseg (m 's) (under (m 's) 100))

(text "GND" (under (m 's) 100))

(let inpoint (right-of (m 'in) -50))
(lseg (m 'in) inpoint)
(text "V(in)" (coord (x-of inpoint) (y-of inpoint)))

(let rpoint1 (over (m 'd) 100))
(let rpoint2 (over rpoint1 40))
(resistor rpoint2 rpoint1)

(lseg (m 'd) rpoint1)

(lseg rpoint2 (over rpoint1 100))

(let anotherpoint (average-of-coords (list rpoint1 (m 'd))))
(let outpoint (right-of anotherpoint 100))

(lseg outpoint anotherpoint)
(text "V(out)" outpoint)

(text "V(1)" (over rpoint1 120))`,

`(def (grid-apply f int)
  (for x 0 (< x canvas-width) (+ x int)
       (for y 0 (< y canvas-height) (+ y int)
            (f x y))))


(let xmid 400)
(let ymid 400)
(let mid (coord xmid ymid))
(let dashed (stroke-style (style: "dashed")))

(def (out-vector x y size col)
  (circle x y (* size 0.5) (fill: col))
  (circle x y size (stroke: (stroke-style (color: col)))))

(out-vector xmid ymid 15 "black")

(grid-apply
 (! (x y)
    (if (not (and (= x xmid) (= y ymid)))
      (begin
       (let d (distance (coord x y) mid))
       (out-vector x y
                (/ 20 (log (/ d 5)))
                "blue"))))
 50)

(def (B-vect r a1 a2)
  (let p1 (coord+vect mid
                      ((vector r 0) 'rotated a1)))
  (let p2 (coord+vect mid
                      ((vector r 0) 'rotated a2)))
  (arrow p1 p2
         (stroke: (stroke-style (width: 2) (color: "red")))))

(def (B-field r)
  (let incr (/ 360 (/ r 6)))
  (let p1 (coord 0 0))
  (let p2 (coord 0 0))
  (for a 360 (> a 0) (- a incr)
       (B-vect r a (- a (* (/ 1 (/ r 50) )incr)))))

(B-field 50)
(B-field 100)
(B-field 180)

(let o
     (circle xmid ymid 200
             (stroke: dashed)))

(let a (* 360 (random)))

(let i (o 'tangent a))
((i 'draw))
(let l (line-from-points mid (coord+vect mid (o 'radial-vect a))
                  (stroke: dashed)))

(let intr (i 'intersect l))

(circle (x-of intr) (y-of intr) 5 (fill: "green"))`,

`(def (grid-apply f int)
  (for x 0 (< x canvas-width) (+ x int)
       (for y 0 (< y canvas-height) (+ y int)
            (f x y))))
(let mid (coord (/ canvas-width 2) (/ canvas-height 2)))
(lseg (coord 0 (y-of mid)) (coord canvas-height (y-of mid)))
(tex "x" (coord (- canvas-height 30) (+ (y-of mid) 15)) 8)
(lseg (coord (x-of mid) 0) (coord (x-of mid) canvas-width))
(tex "y" (coord (- (x-of mid) 30) 15) 8)
(tex "0" (coord (- (x-of mid) 30) (+ (y-of mid) 12)) 8)
(def (fx x y) (* (sin x) 20))
(def (fy x y) (* (cos y) 20))
(def (df x y)
  (let tx (- x (x-of mid)))
  (let ty (- y (y-of mid)))
  (// arrow (coord x y) (coord (+ x (fx tx ty)) (+ y (fy tx ty))))
  (lseg (coord (- x (fy tx ty)) (+ y (fx tx ty))) (coord (+ x (fy tx ty)) (- y (fx tx ty)))))
(grid-apply df 25)`
]
