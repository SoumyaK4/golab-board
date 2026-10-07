package state

import (
	"math"
	"strconv"
	"strings"

	"github.com/golab/board/pkg/core/color"
	"github.com/golab/board/pkg/core/coord"
)

type ScoreBreakdown struct {
	Scoring        string    `json:"scoring"`
	BlackTerritory int       `json:"black_territory"`
	WhiteTerritory int       `json:"white_territory"`
	BlackCaptures  int       `json:"black_captures"`
	WhiteCaptures  int       `json:"white_captures"`
	BlackStones    int       `json:"black_stones"`
	WhiteStones    int       `json:"white_stones"`
	Komi           float64   `json:"komi"`
	Handicap       float64   `json:"handicap"`
	BlackTotal     float64   `json:"black_total"`
	WhiteTotal     float64   `json:"white_total"`
	Confidence     []float64 `json:"confidence"`
}

func firstField(f FieldProvider, key string) string {
	if values := f.GetField(key); len(values) > 0 {
		return values[0]
	}
	return ""
}

func (s *State) scoreRules() *ScoreBreakdown {
	rules := strings.ToLower(firstField(s.root, "RU"))
	score := &ScoreBreakdown{Scoring: "territory"}
	handicap, _ := strconv.Atoi(firstField(s.root, "HA"))
	handicap = max(0, handicap)
	switch {
	case strings.Contains(rules, "chinese"):
		score.Scoring = "area"
		score.Handicap = float64(handicap)
	case strings.Contains(rules, "aga"):
		score.Scoring = "area"
		score.Handicap = float64(max(0, handicap-1))
	case strings.Contains(rules, "new zealand"), strings.Contains(rules, "tromp"), rules == "nz":
		score.Scoring = "area"
	case strings.Contains(rules, "stone"):
		score.Scoring = "stone"
	}
	score.Komi, _ = strconv.ParseFloat(firstField(s.root, "KM"), 64)
	if math.IsInf(score.Komi, 0) || math.IsNaN(score.Komi) {
		score.Komi = 0
	}
	if score.Komi == 375 {
		score.Komi = 7.5
	}
	return score
}

func (s *State) estimateScore(manual bool) {
	next := color.Black
	for node := s.current; node != nil; node = node.Up {
		if player := firstField(node, "PL"); player == "B" || player == "W" {
			if player == "W" {
				next = color.White
			}
			break
		}
		if IsMove(node) {
			next = Color(node).Opposite()
			break
		}
		if node == s.root {
			handicap, _ := strconv.Atoi(firstField(s.root, "HA"))
			if handicap > 0 {
				next = color.White
			}
		}
	}
	var dead coord.CoordSet
	if manual {
		dead = s.markedDead
	}
	s.estimate = s.board.EstimateScore(next, dead, s.scoreRules().Scoring == "territory")
	s.markedDead = s.estimate.Dead
}

func (s *State) scoreFrame() *Frame {
	if s.estimate == nil {
		s.estimateScore(false)
	}
	score := s.scoreRules()
	score.Confidence = append([]float64(nil), s.estimate.Confidence...)
	frame := &Frame{BlackArea: []*coord.Coord{}, WhiteArea: []*coord.Coord{}, Dame: []*coord.Coord{}, Score: score}
	if score.Scoring == "territory" {
		score.BlackCaptures = s.current.BlackCaps
		score.WhiteCaptures = s.current.WhiteCaps
	}
	for p, owner := range s.estimate.Owners {
		c := coord.NewCoord(p%s.size, p/s.size)
		stone := s.board.Get(c)
		if stone != color.Empty && !s.markedDead.Has(c) {
			if score.Scoring != "territory" {
				if stone == color.Black {
					score.BlackStones++
				} else {
					score.WhiteStones++
				}
			}
			continue
		}
		if override, ok := s.ownershipOverrides[p]; ok && stone == color.Empty {
			owner = override
			score.Confidence[p] = 0
			if owner == color.Black {
				score.Confidence[p] = 1
			} else if owner == color.White {
				score.Confidence[p] = -1
			}
		}
		if stone != color.Empty && score.Scoring == "territory" {
			if stone == color.Black {
				score.WhiteCaptures++
			} else {
				score.BlackCaptures++
			}
		}
		switch owner {
		case color.Black:
			frame.BlackArea = append(frame.BlackArea, c)
			if score.Scoring != "stone" {
				score.BlackTerritory++
			}
		case color.White:
			frame.WhiteArea = append(frame.WhiteArea, c)
			if score.Scoring != "stone" {
				score.WhiteTerritory++
			}
		default:
			frame.Dame = append(frame.Dame, c)
		}
	}
	frame.BlackCaps = score.BlackTerritory + score.BlackCaptures + score.BlackStones
	frame.WhiteCaps = score.WhiteTerritory + score.WhiteCaptures + score.WhiteStones
	score.BlackTotal = float64(frame.BlackCaps)
	score.WhiteTotal = float64(frame.WhiteCaps) + score.Komi + score.Handicap
	return frame
}

type estimateCommand struct{}

func NewEstimateCommand() Command { return &estimateCommand{} }
func (cmd *estimateCommand) Execute(s *State) (*Frame, error) {
	if s.estimate != nil {
		s.AnyMove()
		return s.GenerateFullFrame(CurrentOnly), nil
	}
	return s.scoreFrame(), nil
}

type estimateMarkCommand struct{ crd *coord.Coord }

func NewEstimateMarkCommand(crd *coord.Coord) Command { return &estimateMarkCommand{crd} }
func (cmd *estimateMarkCommand) Execute(s *State) (*Frame, error) {
	c := cmd.crd
	if c.X < 0 || c.Y < 0 || c.X >= s.size || c.Y >= s.size {
		return nil, nil
	}
	if s.estimate == nil {
		return s.GenerateFullFrame(CurrentOnly), nil
	}
	if s.board.Get(c) == color.Empty {
		p := c.Y*s.size + c.X
		owner := s.estimate.Owners[p]
		if override, ok := s.ownershipOverrides[p]; ok {
			owner = override
		}
		if s.ownershipOverrides == nil {
			s.ownershipOverrides = make(map[int]color.Color)
		}
		s.ownershipOverrides[p] = (owner + 1) % 3
	} else {
		group := s.board.FindGroup(c)
		if s.markedDead.Has(c) {
			s.markedDead.RemoveAll(group.Coords)
		} else {
			s.markedDead.AddAll(group.Coords)
		}
		s.estimateScore(true)
	}
	return s.scoreFrame(), nil
}
