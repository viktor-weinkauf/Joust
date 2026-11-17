import { describe, expect, it } from "vitest";
import * as Immutable from "immutable";
import HSReplayDecoder from "./HSReplayDecoder";
import GameState from "../state/GameState";
import Hand from "../components/game/Hand";
import Entity from "../Entity";
import { CardClass, GameTag, Zone } from "../enums";

function replay() {
	const decoder = new HSReplayDecoder();
	let state = new GameState();
	decoder.on("data", (mutator) => {
		state = state.apply(mutator);
	});
	decoder.write('<HSReplay version="1.7.0" build="255790"><Game id="1">');
	return {
		decoder,
		write: (xml: string) => decoder.write(xml),
		state: () => state,
		close: () => decoder.end("</Game></HSReplay>"),
	};
}

function full(id: number, card: string, zone: Zone, cardClass: CardClass) {
	return (
		`<FullEntity id="${id}" cardID="${card}">` +
		`<Tag tag="${GameTag.ZONE}" value="${zone}" />` +
		`<Tag tag="${GameTag.CLASS}" value="${cardClass}" />` +
		`<Tag tag="${GameTag.CONTROLLER}" value="2" /></FullEntity>`
	);
}

function creator(id = 87, source = 43) {
	return `<TagChange entity="${id}" tag="${
		GameTag.DISPLAYED_CREATOR
	}" value="${source}" />`;
}

function renderedCard(entity: Entity, oracleCard: string) {
	const hand = new Hand({
		cardOracle: Immutable.Map([[87, oracleCard]]),
	} as any);
	return (hand as any).renderEntity(entity, null).props.entity as Entity;
}

describe("Announce Darkness hidden replacements", () => {
	it("invalidates a known card, preserves history, and accepts its later reveal", () => {
		const r = replay();
		r.write(full(43, "VAC_941", Zone.PLAY, CardClass.WARLOCK));
		r.write(full(87, "WW_044t", Zone.HAND, CardClass.NEUTRAL));
		const before = r.state();
		r.write(creator());
		const transformed = r.state();
		expect(transformed.getEntity(87).cardId).toBeNull();
		expect(transformed.getEntity(87).identityInvalidated).toBe(true);
		expect(before.getEntity(87).cardId).toBe("WW_044t");
		// Neither stale oracle data nor a future reveal belongs in this hand.
		expect(
			renderedCard(transformed.getEntity(87), "WW_044t").cardId,
		).toBeNull();
		expect(
			renderedCard(transformed.getEntity(87), "TTN_463").cardId,
		).toBeNull();
		r.write(
			`<TagChange entity="87" tag="${
				GameTag.ZONE_POSITION
			}" value="1" />`,
		);
		expect(r.state().getEntity(87).identityInvalidated).toBe(true);
		r.write(
			`<ShowEntity entity="87" cardID="TTN_463"><Tag tag="${
				GameTag.CLASS
			}" value="${CardClass.WARLOCK}" /></ShowEntity>`,
		);
		expect(r.state().getEntity(87).cardId).toBe("TTN_463");
		expect(r.state().getEntity(87).identityInvalidated).toBe(false);
		expect(renderedCard(r.state().getEntity(87), "WW_044t").cardId).toBe(
			"TTN_463",
		);
		expect(transformed.getEntity(87).cardId).toBeNull();
		r.close();
	});

	it("suppresses the oracle when the Barrel was already hidden in the deck", () => {
		const r = replay();
		r.write(full(43, "VAC_941", Zone.PLAY, CardClass.WARLOCK));
		r.write(full(87, "WW_044t", Zone.DECK, CardClass.NEUTRAL));
		r.write(`<HideEntity entity="87" zone="${Zone.DECK}" />`);
		r.write(creator());
		r.write(
			`<TagChange entity="87" tag="${GameTag.ZONE}" value="${
				Zone.HAND
			}" />`,
		);
		expect(
			renderedCard(r.state().getEntity(87), "WW_044t").cardId,
		).toBeNull();
		r.close();
	});

	it("keeps an already revealed Warlock replacement", () => {
		const r = replay();
		r.write(full(43, "VAC_941", Zone.PLAY, CardClass.WARLOCK));
		r.write(full(87, "TTN_463", Zone.HAND, CardClass.WARLOCK));
		r.write(creator());
		expect(r.state().getEntity(87).cardId).toBe("TTN_463");
		expect(r.state().getEntity(87).identityInvalidated).toBe(false);
		r.close();
	});

	it.each([Zone.PLAY, Zone.GRAVEYARD, Zone.SETASIDE])(
		"does not invalidate cards outside hand/deck (%s)",
		(zone) => {
			const r = replay();
			r.write(full(43, "VAC_941", Zone.PLAY, CardClass.WARLOCK));
			r.write(full(87, "WW_044t", zone, CardClass.NEUTRAL));
			r.write(creator());
			expect(r.state().getEntity(87).cardId).toBe("WW_044t");
			r.close();
		},
	);

	it("does not treat every displayed creator as a transformation", () => {
		const r = replay();
		r.write(full(43, "WW_041", Zone.PLAY, CardClass.WARLOCK));
		r.write(full(87, "WW_044t", Zone.HAND, CardClass.NEUTRAL));
		r.write(creator());
		expect(r.state().getEntity(87).identityInvalidated).toBe(false);
		expect(r.state().getEntity(87).cardId).toBe("WW_044t");
		r.close();
	});

	it("retains ordinary oracle reveals for cards without a transformation", () => {
		const entity = new Entity(87, Immutable.Map<string, number>());
		expect(renderedCard(entity, "WW_044t").cardId).toBe("WW_044t");
	});
});
