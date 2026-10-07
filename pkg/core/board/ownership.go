package board

import "math"

const estimateTrials = 1000
const estimateTolerance = 0.30

type ownershipBoard struct {
	points             []int
	neighbors, corners [][]int
	visited, queue     []int
	generation         int
	random             uint32
	ko                 int
}

func newOwnershipBoard(points []int, size int) *ownershipBoard {
	g := &ownershipBoard{points: append([]int(nil), points...), neighbors: make([][]int, len(points)), corners: make([][]int, len(points)), visited: make([]int, len(points)), queue: make([]int, len(points)), random: 0x811c9dc5, ko: -1}
	for p, value := range points {
		g.random = ((g.random ^ uint32(value+2)) * 0x01000193) & 0x7fffffff
		x, y := p%size, p/size
		if x > 0 {
			g.neighbors[p] = append(g.neighbors[p], p-1)
		}
		if x+1 < size {
			g.neighbors[p] = append(g.neighbors[p], p+1)
		}
		if y > 0 {
			g.neighbors[p] = append(g.neighbors[p], p-size)
		}
		if y+1 < size {
			g.neighbors[p] = append(g.neighbors[p], p+size)
		}
		for _, dy := range []int{-1, 1} {
			for _, dx := range []int{-1, 1} {
				if x+dx >= 0 && x+dx < size && y+dy >= 0 && y+dy < size {
					g.corners[p] = append(g.corners[p], p+dy*size+dx)
				}
			}
		}
	}
	if g.random == 0 {
		g.random = 1
	}
	return g
}

func (g *ownershipBoard) region(source []int, start int) (group, borders []int) {
	g.generation++
	g.queue[0], g.visited[start] = start, g.generation
	length := 1
	for i := 0; i < length; i++ {
		p := g.queue[i]
		if source[p] != source[start] {
			borders = append(borders, p)
			continue
		}
		group = append(group, p)
		for _, q := range g.neighbors[p] {
			if g.visited[q] != g.generation {
				g.visited[q] = g.generation
				g.queue[length] = q
				length++
			}
		}
	}
	return
}

func (g *ownershipBoard) liberties(start int, stopAtFirst bool) int {
	g.generation++
	g.queue[0], g.visited[start] = start, g.generation
	length, liberties := 1, 0
	for i := 0; i < length; i++ {
		for _, q := range g.neighbors[g.queue[i]] {
			if g.visited[q] == g.generation {
				continue
			}
			g.visited[q] = g.generation
			if g.points[q] == g.points[start] {
				g.queue[length] = q
				length++
			} else if g.points[q] == 0 {
				liberties++
				if stopAtFirst {
					return liberties
				}
			}
		}
	}
	return liberties
}

func (g *ownershipBoard) minLiberties(p int) int {
	result := len(g.points) + 1
	for _, q := range g.neighbors[p] {
		result = min(result, g.liberties(q, false))
	}
	return result
}

func (g *ownershipBoard) eye(p, player int, horseshoe bool) bool {
	friendly, opposing := 0, 0
	for _, q := range g.neighbors[p] {
		if g.points[q] == player {
			friendly++
		}
		if g.points[q] == -player {
			opposing++
		}
	}
	required := len(g.neighbors[p])
	if horseshoe {
		required--
	}
	if friendly < required || opposing != 0 {
		return false
	}
	hostile := 0
	for _, q := range g.corners[p] {
		if g.points[q] == -player {
			hostile++
		}
	}
	return !(hostile >= len(g.corners[p])/2 && g.minLiberties(p) <= 1)
}

func (g *ownershipBoard) place(p, player int, possible *[]int) bool {
	if p == g.ko {
		return false
	}
	g.points[p] = player
	captured, ko := false, -1
	for _, q := range g.neighbors[p] {
		if g.points[q] != -player || g.liberties(q, true) != 0 {
			continue
		}
		group, _ := g.region(g.points, q)
		for _, member := range group {
			g.points[member] = 0
			*possible = append(*possible, member)
		}
		if len(group) == 1 {
			ko = group[0]
		}
		captured = true
	}
	if !captured && g.liberties(p, true) == 0 {
		g.points[p] = 0
		return false
	}
	g.ko = ko
	return true
}

func (g *ownershipBoard) fillFalseEyes() {
	var eyes []int
	for p, value := range g.points {
		if value != 0 || g.minLiberties(p) > 1 {
			continue
		}
		for _, player := range []int{1, -1} {
			all, hostile := true, 0
			for _, q := range g.neighbors[p] {
				if g.points[q] != player {
					all = false
				}
			}
			for _, q := range g.corners[p] {
				if g.points[q] == -player {
					hostile++
				}
			}
			if all && hostile >= len(g.corners[p])/2 {
				eyes = append(eyes, p)
				break
			}
		}
	}
	for _, p := range eyes {
		var removed []int
		g.place(p, g.points[g.neighbors[p][0]], &removed)
	}
}

func (g *ownershipBoard) playOut(player int, life, seki []int) {
	g.ko = -1
	possible, illegal := make([]int, 0, len(g.points)), make([]int, 0, len(g.points))
	for p, value := range g.points {
		if value == 0 && life[p] == 0 && seki[p] == 0 {
			possible = append(possible, p)
		}
	}
	passed := false
	for sanity := 999; len(possible) > 0 && sanity > 0; sanity-- {
		g.random = (g.random*1103515245 + 12345) & 0x7fffffff
		i := int(g.random) % len(possible)
		p := possible[i]
		legal := !g.eye(p, player, false) && g.place(p, player, &possible)
		copy(possible[i:], possible[i+1:])
		possible = possible[:len(possible)-1]
		if legal {
			passed = false
			player = -player
			possible = append(possible, illegal...)
			illegal = illegal[:0]
		} else {
			illegal = append(illegal, p)
			if len(possible) == 0 {
				if passed {
					break
				}
				passed = true
				player = -player
				possible = append(possible, illegal...)
				illegal = illegal[:0]
			}
		}
	}
}

func (g *ownershipBoard) rollout(player int, pullUpLife bool, life, bias, seki []int) []int {
	n := len(g.points)
	if life == nil {
		life = make([]int, n)
	}
	if seki == nil {
		seki = make([]int, n)
	}
	result := make([]int, n)
	copy(result, bias)
	played := &ownershipBoard{points: make([]int, n), neighbors: g.neighbors, corners: g.corners, visited: make([]int, n), queue: make([]int, n), random: g.random}
	for trial := 0; trial < estimateTrials; trial++ {
		copy(played.points, g.points)
		played.playOut(player, life, seki)
		for p := range played.points {
			if played.points[p] == 0 {
				group, border := played.region(played.points, p)
				owner := 0
				if len(border) > 0 {
					owner = played.points[border[0]]
				}
				for _, q := range border {
					if played.points[q] != owner {
						owner = 0
						break
					}
				}
				if owner != 0 {
					for _, q := range group {
						played.points[q] = owner
					}
				}
			}
			result[p] += played.points[p]
		}
	}
	g.random = played.random
	visited := make([]bool, n)
	for p, value := range g.points {
		if value == 0 || visited[p] {
			continue
		}
		group, border := g.region(g.points, p)
		selected := result[group[0]]
		for _, q := range group {
			visited[q] = true
			if absInt(result[q]) > absInt(selected) {
				selected = result[q]
			}
		}
		if pullUpLife {
			for _, q := range border {
				if selected < 0 {
					selected = min(selected, result[q])
				} else if selected > 0 {
					selected = max(selected, result[q])
				}
			}
		}
		for _, q := range group {
			result[q] = selected
		}
	}
	return result
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func (g *ownershipBoard) scanSeki(rollout []int) []int {
	seki, visited := make([]int, len(g.points)), make([]bool, len(g.points))
	threshold := estimateTrials / 5
	for p, value := range g.points {
		if visited[p] {
			continue
		}
		group, border := g.region(g.points, p)
		uncertain := value != 0
		for _, q := range group {
			visited[q] = true
			if absInt(rollout[q]) > threshold {
				uncertain = false
			}
		}
		if !uncertain {
			continue
		}
		var opponents []int
		libs, candidate := 0, false
		for _, q := range border {
			if g.points[q] == 0 {
				libs++
			}
			if g.points[q] == -value {
				opponents = append(opponents, q)
				if absInt(rollout[q]) <= threshold {
					candidate = true
				}
			}
		}
		if !candidate {
			continue
		}
		for _, q := range opponents {
			if absInt(rollout[q]) >= threshold {
				continue
			}
			if g.liberties(q, false) != libs {
				candidate = false
			}
		}
		if candidate {
			for _, q := range group {
				seki[q] = 1
			}
			for _, q := range border {
				if g.points[q] == 0 {
					seki[q] = 1
				}
			}
		}
	}
	return seki
}

func (g *ownershipBoard) strongLife() []int {
	n := len(g.points)
	territory, unified, result := make([]int, n), append([]int(nil), g.points...), make([]int, n)
	for p, value := range g.points {
		if value != 0 || territory[p] != 0 {
			continue
		}
		group, border := g.region(g.points, p)
		owner := 0
		if len(border) > 0 {
			owner = g.points[border[0]]
		}
		for _, q := range border {
			if g.points[q] != owner {
				owner = 0
				break
			}
		}
		for _, q := range group {
			territory[q] = len(group) * owner
			unified[q] = owner
		}
	}
	visited := make([]bool, n)
	for p := range g.points {
		if visited[p] {
			continue
		}
		group, _ := g.region(unified, p)
		eyes, count := 0, 0
		for _, q := range group {
			if visited[q] || territory[q] == 0 {
				continue
			}
			eye, _ := g.region(g.points, q)
			for _, r := range eye {
				visited[r] = true
			}
			eyes++
			count += len(eye)
		}
		for _, q := range group {
			visited[q] = true
			if eyes >= 2 || count >= 5 {
				result[q] = count
			}
		}
	}
	return result
}

func (g *ownershipBoard) analyze(player int) (owners []int, confidence []float64) {
	g.fillFalseEyes()
	seki := g.scanSeki(g.rollout(player, false, nil, nil, nil))
	bias := make([]int, len(g.points))
	for p, value := range g.points {
		if value != 0 || !(g.eye(p, 1, true) || g.eye(p, -1, true)) {
			continue
		}
		for _, q := range g.neighbors[p] {
			group, _ := g.region(g.points, q)
			for _, r := range group {
				bias[r]++
			}
		}
	}
	for p := range bias {
		bias[p] *= g.points[p] * int(estimateTrials*(estimateTolerance/4))
	}
	pass := g.rollout(player, true, g.strongLife(), bias, seki)
	owners, confidence = make([]int, len(g.points)), make([]float64, len(g.points))
	threshold := float64(estimateTrials) * estimateTolerance
	for p, value := range pass {
		confidence[p] = math.Max(-1, math.Min(1, float64(value)/estimateTrials))
		if float64(value) > threshold {
			owners[p] = 1
		} else if float64(value) < -threshold {
			owners[p] = -1
		} else if g.points[p] != 0 && float64(absInt(value)) >= threshold/3 {
			if value > 0 {
				owners[p] = 1
			} else {
				owners[p] = -1
			}
		}
	}
	visited := make([]bool, len(g.points))
	for p := range owners {
		if owners[p] != 0 || visited[p] {
			continue
		}
		group, border := g.region(g.points, p)
		black, white := true, true
		for _, q := range border {
			if owners[q] == -1 {
				black = false
			}
			if owners[q] == 1 {
				white = false
			}
		}
		for _, q := range group {
			visited[q] = true
			if black {
				owners[q] = 1
			} else if white {
				owners[q] = -1
			}
		}
	}
	return
}
