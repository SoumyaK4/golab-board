package board

import (
	"github.com/golab/board/pkg/core/color"
	"github.com/golab/board/pkg/core/coord"
)

type Estimate struct {
	Owners     []color.Color
	Confidence []float64
	Dead       coord.CoordSet
}

func (b *Board) EstimateScore(next color.Color, dead coord.CoordSet, territory bool) *Estimate {
	points := make([]int, b.Size*b.Size)
	for y, row := range b.Points {
		for x, c := range row {
			if c == color.Black {
				points[y*b.Size+x] = 1
			} else if c == color.White {
				points[y*b.Size+x] = -1
			}
		}
	}
	if dead == nil {
		dead = coord.NewCoordSet()
		_, black := estimateOwnership(points, b.Size, 1, territory)
		_, white := estimateOwnership(points, b.Size, -1, territory)
		g := newOwnershipBoard(points, b.Size)
		seen := make([]bool, len(points))
		for p, value := range points {
			if value == 0 || seen[p] {
				continue
			}
			group, _ := g.region(points, p)
			influence := 0.0
			for _, q := range group {
				seen[q] = true
				influence += (black[q] + white[q]) / 2
			}
			if influence/float64(len(group))*float64(value) < -estimateTolerance {
				for _, q := range group {
					dead.Add(coord.NewCoord(q%b.Size, q/b.Size))
				}
			}
		}
	}
	effectiveDead := coord.NewCoordSet()
	for _, p := range dead {
		if p.X >= 0 && p.Y >= 0 && p.X < b.Size && p.Y < b.Size && b.Get(p) != color.Empty && !effectiveDead.Has(p) {
			effectiveDead.AddAll(b.FindGroup(p).Coords)
		}
	}
	retained := append([]int(nil), points...)
	for _, p := range effectiveDead {
		retained[p.Y*b.Size+p.X] = 0
	}
	player := 1
	if next == color.White {
		player = -1
	}
	owners, confidence := estimateOwnership(retained, b.Size, player, territory)
	result := &Estimate{Owners: make([]color.Color, len(points)), Confidence: confidence, Dead: effectiveDead}
	for p, value := range points {
		if owners[p] > 0 {
			result.Owners[p] = color.Black
		} else if owners[p] < 0 {
			result.Owners[p] = color.White
		}
		if value == 0 {
			continue
		}
		c := color.Black
		if value < 0 {
			c = color.White
		}
		if effectiveDead.Has(coord.NewCoord(p%b.Size, p/b.Size)) {
			c = c.Opposite()
		}
		result.Owners[p] = c
	}
	return result
}

func estimateOwnership(points []int, size, player int, territory bool) (owners []int, confidence []float64) {
	stones := 0
	for _, p := range points {
		if p != 0 {
			stones++
		}
	}
	if stones <= 1 {
		owners = append([]int(nil), points...)
		confidence = make([]float64, len(points))
		for p, value := range points {
			confidence[p] = float64(value)
		}
		return
	}
	g := newOwnershipBoard(points, size)
	owners, confidence = g.analyze(player)
	g.correctSeki(points, owners, confidence, territory)
	return
}

func (g *ownershipBoard) correctSeki(points, owners []int, confidence []float64, territory bool) {
	type chain struct {
		points, libs []int
		color        int
	}
	var chains []chain
	chainAt := make([]int, len(points))
	for p := range chainAt {
		chainAt[p] = -1
	}
	for p, value := range points {
		if value == 0 || chainAt[p] >= 0 {
			continue
		}
		group, border := g.region(points, p)
		c := chain{points: group, color: value}
		for _, q := range border {
			if points[q] == 0 {
				c.libs = append(c.libs, q)
			}
		}
		for _, q := range group {
			chainAt[q] = len(chains)
		}
		chains = append(chains, c)
	}
	setOwner := func(p, owner int) { owners[p] = owner; confidence[p] = float64(owner) }
	for a, first := range chains {
		if len(first.libs) != 2 {
			continue
		}
		for b := a + 1; b < len(chains); b++ {
			second := chains[b]
			if first.color == second.color || len(second.libs) != 2 {
				continue
			}
			var shared, privateFirst, privateSecond []int
			for _, p := range first.libs {
				if p == second.libs[0] || p == second.libs[1] {
					shared = append(shared, p)
				} else {
					privateFirst = append(privateFirst, p)
				}
			}
			if len(shared) == 0 {
				continue
			}
			for _, p := range second.libs {
				if p != first.libs[0] && p != first.libs[1] {
					privateSecond = append(privateSecond, p)
				}
			}
			closed := true
			for _, libs := range [][]int{first.libs, second.libs} {
				for _, p := range libs {
					for _, q := range g.neighbors[p] {
						if chainAt[q] != a && chainAt[q] != b {
							closed = false
						}
					}
				}
			}
			trueEye := func(p, id int) bool {
				for _, neighbors := range [][]int{g.neighbors[p], g.corners[p]} {
					for _, q := range neighbors {
						if chainAt[q] != id {
							return false
						}
					}
				}
				return true
			}
			if !closed || len(shared) == 1 && (!trueEye(privateFirst[0], a) || !trueEye(privateSecond[0], b)) {
				continue
			}
			for _, p := range first.points {
				setOwner(p, first.color)
			}
			for _, p := range second.points {
				setOwner(p, second.color)
			}
			for _, p := range shared {
				setOwner(p, 0)
			}
			for _, p := range privateFirst {
				owner := first.color
				if territory {
					owner = 0
				}
				setOwner(p, owner)
			}
			for _, p := range privateSecond {
				owner := second.color
				if territory {
					owner = 0
				}
				setOwner(p, owner)
			}
		}
	}
}
