# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

"""Tests for scenario technique factory resolution (``technique_resolution``)."""

import pytest

from pyrit.scenario.core.technique_resolution import (
    TechniqueResolutionError,
    resolve_technique_factories,
)
from tests.unit.scenario.core.test_matrix_atomic_attack_builder import (
    _context,
    _mock_factory,
    _patch_registry,
    _technique,
)


class TestResolveTechniqueFactories:
    """``resolve_technique_factories`` filters the registry to the selected techniques."""

    def test_keeps_only_selected_in_order(self):
        factories = {
            "alpha": _mock_factory(name="alpha"),
            "beta": _mock_factory(name="beta"),
            "gamma": _mock_factory(name="gamma"),
        }
        context = _context(techniques=[_technique("beta"), _technique("alpha")])
        with _patch_registry(factories):
            resolved = resolve_technique_factories(context=context)
        assert list(resolved.keys()) == ["beta", "alpha"]

    def test_raises_when_any_selected_technique_is_missing(self):
        factories = {"alpha": _mock_factory(name="alpha")}
        context = _context(techniques=[_technique("alpha"), _technique("missing")])
        with _patch_registry(factories), pytest.raises(TechniqueResolutionError, match="missing"):
            resolve_technique_factories(context=context)

    def test_raises_when_all_selected_techniques_missing(self):
        """A nonempty selection resolving to nothing must fail loudly, not run baseline-only."""
        factories = {"alpha": _mock_factory(name="alpha")}
        context = _context(techniques=[_technique("missing_a"), _technique("missing_b")])
        with _patch_registry(factories), pytest.raises(TechniqueResolutionError, match="missing_a"):
            resolve_technique_factories(context=context)

    def test_empty_selection_resolves_without_error(self):
        context = _context(techniques=[])
        with _patch_registry({}):
            assert resolve_technique_factories(context=context) == {}

    def test_error_lists_each_missing_technique_once_in_selection_order(self):
        factories = {"alpha": _mock_factory(name="alpha")}
        context = _context(
            techniques=[
                _technique("missing_a"),
                _technique("alpha"),
                _technique("missing_b"),
                _technique("missing_a"),
            ]
        )
        with _patch_registry(factories), pytest.raises(TechniqueResolutionError) as exc_info:
            resolve_technique_factories(context=context)
        message = str(exc_info.value)
        assert message.index("missing_a") < message.index("missing_b")
        assert message.count("missing_a") == 1

    def test_extra_factories_merged_and_override_registry(self):
        registry_factories = {"alpha": _mock_factory(name="alpha")}
        local_alpha = _mock_factory(name="alpha")
        local_only = _mock_factory(name="local")
        context = _context(techniques=[_technique("alpha"), _technique("local")])
        with _patch_registry(registry_factories):
            resolved = resolve_technique_factories(
                context=context,
                extra_factories={"alpha": local_alpha, "local": local_only},
            )
        assert list(resolved.keys()) == ["alpha", "local"]
        assert resolved["alpha"] is local_alpha  # extra overrides the registry factory of the same name
        assert resolved["local"] is local_only  # local-only factory is selectable without global registration
