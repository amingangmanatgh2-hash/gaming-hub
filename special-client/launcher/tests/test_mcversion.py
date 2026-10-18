"""Version JSON model: rules, libraries, argument expansion, launch args."""
from special_client.core.mcversion import (LaunchEnv, LaunchSpec,
                                           ArgumentError, expand_game_args,
                                           expand_jvm_args, extract_natives,
                                           merge_versions, rule_allowed,
                                           version_from_raw)

WIN = LaunchEnv(os_name="windows", arch="x86_64")
LIN = LaunchEnv(os_name="linux", arch="x86_64")


class TestRules:
    def test_no_rules_allowed(self):
        assert rule_allowed(None, WIN) is True
        assert rule_allowed([], WIN) is True

    def test_allow_rule(self):
        assert rule_allowed([{"action": "allow"}], LIN) is True

    def test_disallow(self):
        assert rule_allowed([{"action": "disallow"}], WIN) is False

    def test_os_name_rule(self):
        # Mojang idiom: last matching rule wins; default when nothing
        # matches is "allowed".
        rules = [{"action": "allow", "os": {"name": "linux"}},
                 {"action": "disallow", "os": {"name": "windows"}}]
        assert rule_allowed(rules, LIN) is True
        assert rule_allowed(rules, WIN) is False

    def test_default_allowed_when_no_rule_matches(self):
        rules = [{"action": "allow", "os": {"name": "linux"}}]
        assert rule_allowed(rules, LIN) is True
        assert rule_allowed(rules, WIN) is True  # spec default: true

    def test_last_matching_rule_wins(self):
        rules = [{"action": "disallow"},
                 {"action": "allow"}]
        assert rule_allowed(rules, WIN) is True

    def test_os_arch_rule(self):
        rules = [{"action": "allow", "os": {"arch": "x86_64"}},
                 {"action": "disallow", "os": {"arch": "x86"}}]
        assert rule_allowed(rules, WIN) is True
        assert rule_allowed(rules, LaunchEnv("windows", "x86")) is False

    def test_feature_rule(self):
        rules = [{"action": "allow", "features": {"is_demo_user": False}},
                 {"action": "disallow", "features": {"is_demo_user": True}}]
        assert rule_allowed(rules, WIN) is True
        env = LaunchEnv("windows", "x86_64", {"is_demo_user": True})
        assert rule_allowed(rules, env) is False


class TestLibraries:
    def test_maven_path(self, version_1_20_1):
        v = version_from_raw(version_1_20_1)
        lib = v.libraries[0]
        assert lib.name == "org.testfw:core-lib:1.0.0"
        assert str(lib.maven_path()) == \
            "org/testfw/core-lib/1.0.0/core-lib-1.0.0.jar"

    def test_classifier_path(self, version_1_20_1):
        v = version_from_raw(version_1_20_1)
        lib = v.libraries[0]
        p = lib.classifier_path("natives-windows-x86_64")
        assert str(p) == \
            "org/testfw/core-lib/1.0.0/core-lib-1.0.0-natives-windows-x86_64.jar"

    def test_native_classifier_selection(self, version_1_20_1):
        v = version_from_raw(version_1_20_1)
        lib = v.libraries[0]
        assert lib.native_classifier(WIN) == "natives-windows-x86_64"
        assert lib.native_classifier(LIN) == "natives-linux"
        assert lib.native_classifier(LaunchEnv("osx", "x86_64")) is None

    def test_rules_exclude_platform_libs(self, version_1_20_1):
        v = version_from_raw(version_1_20_1)
        allowed_win = [l.name for l in v.libraries if l.allowed(WIN)]
        allowed_lin = [l.name for l in v.libraries if l.allowed(LIN)]
        assert "org.testfw:linux-helper:2.0.0" in allowed_lin
        assert "org.testfw:linux-helper:2.0.0" not in allowed_win
        assert "org.testfw:windows-helper:2.0.0" in allowed_win
        assert "org.testfw:windows-helper:2.0.0" not in allowed_lin


class TestArgExpansion:
    def test_modern_game_args(self, version_1_20_1):
        v = version_from_raw(version_1_20_1)
        assert v.is_legacy is False
        args = expand_game_args(v, {
            "auth_player_name": "TestPlayer", "version_name": "1.20.1",
            "game_directory": "/g", "game_assets": "/a",
            "assets_index_name": "test-10", "auth_uuid": "u-123",
            "auth_access_token": "tok", "user_type": "msa",
            "version_type": "release", "clientid": "", "auth_xuid": "x",
        })
        assert args[0] == "--username"
        assert args[1] == "TestPlayer"
        assert "--gameDir" in args and "/g" in args
        assert "--assetIndex" in args and "test-10" in args

    def test_unresolved_variable_raises(self, version_1_20_1):
        v = version_from_raw(version_1_20_1)
        import pytest
        with pytest.raises(ArgumentError):
            expand_game_args(v, {})

    def test_jvm_args_rules(self, version_1_20_1):
        v = version_from_raw(version_1_20_1)
        base = {
            "natives_directory": "/n", "launcher_name": "SPECIAL",
            "launcher_version": "1.0", "classpath": "a.jar;b.jar",
        }
        win = expand_jvm_args(v, base, WIN)
        lin = expand_jvm_args(v, base, LIN)
        assert "-Xss1M" in win          # windows-only rule
        assert "-Xss1M" not in lin
        assert "-cp" in win and "a.jar;b.jar" in win
        assert "-Djava.library.path=/n" in win

    def test_legacy_minecraft_arguments(self, version_1_8_9):
        v = version_from_raw(version_1_8_9)
        assert v.is_legacy is True
        args = expand_game_args(v, {
            "auth_player_name": "P", "version_name": "1.8.9",
            "game_directory": "/g", "game_assets": "/a",
            "assets_index_name": "test-8", "auth_uuid": "u",
            "auth_access_token": "t", "user_properties": "{}",
            "user_type": "mojang",
        })
        assert args[0] == "--username"
        assert args[1] == "P"
        assert "--accessToken" in args
        assert "--userProperties" in args


class TestLaunchSpec:
    def _spec(self, version, tmp_path, env=WIN, **kw):
        defaults = dict(
            game_dir=tmp_path / "game",
            java_path="C:/java/bin/java.exe" if env is WIN else "/usr/bin/java",
            assets_root=tmp_path / "assets",
            libraries_dir=tmp_path / "libraries",
            natives_dir=tmp_path / "natives",
            primary_jar=tmp_path / "game.jar",
            auth={"player_name": "Tester", "uuid": "12345678-1234-1234-1234-123456789012",
                  "access_token": "token123", "xuid": "99", "user_type": "msa"},
            ram_mb=4096,
            env=env,
        )
        defaults.update(kw)
        return LaunchSpec(version=version, **defaults)

    def test_java_command_structure(self, version_1_20_1, tmp_path):
        v = version_from_raw(version_1_20_1)
        spec = self._spec(v, tmp_path)
        cmd = spec.java_command()
        assert cmd[0].endswith("java.exe")
        assert "-Xmx4096M" in cmd
        assert f"-Djava.library.path={spec.natives_dir}" in cmd
        assert cmd[-1 - 0]  # non-empty
        assert "net.minecraft.client.main.Main" in cmd
        # main class sits after jvm args; game args follow it
        mc_idx = cmd.index("net.minecraft.client.main.Main")
        game = cmd[mc_idx + 1:]
        assert game[0] == "--username"
        assert "Tester" in game
        # classpath contains all allowed libraries + primary jar
        import os
        cp = cmd[cmd.index("-cp") + 1]
        parts = cp.split(os.pathsep)
        assert any(p.endswith("core-lib-1.0.0.jar") for p in parts)
        assert any(p.endswith("windows-helper-2.0.0.jar") for p in parts)
        assert not any(p.endswith("linux-helper-2.0.0.jar") for p in parts)
        assert parts[-1] == str(spec.primary_jar)

    def test_legacy_command(self, version_1_8_9, tmp_path):
        v = version_from_raw(version_1_8_9)
        spec = self._spec(v, tmp_path,
                          auth={"player_name": "Old", "uuid": "u",
                                "access_token": "t", "xuid": "",
                                "user_type": "mojang"})
        cmd = spec.java_command()
        assert "net.minecraft.client.main.Main" in cmd
        mc_idx = cmd.index("net.minecraft.client.main.Main")
        game = cmd[mc_idx + 1:]
        assert game[:2] == ["--username", "Old"]
        assert "--userProperties" in game

    def test_natives_extraction(self, version_1_20_1, tmp_path, http_server):
        """Extract native jars (with META-INF exclusion) into natives dir."""
        v = version_from_raw(version_1_20_1)
        spec = self._spec(v, tmp_path, env=WIN)
        spec.libraries_dir.mkdir(parents=True)
        # place the native jar where the spec expects it
        data = http_server["files"]["/libs/core-lib-natives-win.jar"]
        dest = spec.libraries_dir / "org/testfw/core-lib/1.0.0" / \
            "core-lib-1.0.0-natives-windows-x86_64.jar"
        dest.parent.mkdir(parents=True)
        dest.write_bytes(data)
        extract_natives(spec)
        assert (spec.natives_dir / "lwjgl.dll").exists()
        assert not (spec.natives_dir / "MANIFEST.MF").exists()
        # idempotent
        extract_natives(spec)


class TestMergeVersions:
    def test_fabric_style_merge(self, version_1_20_1):
        override = {
            "id": "1.20.1-fabric-0.16.9",
            "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
            "type": "release",
            "arguments": {"game": []},
            "libraries": [
                {"name": "net.fabricmc:fabric-loader:0.16.9",
                 "url": "https://maven.fabricmc.net"},
            ],
        }
        merged = merge_versions(version_1_20_1, override)
        assert merged["id"] == "1.20.1-fabric-0.16.9"
        assert merged["mainClass"] == \
            "net.fabricmc.loader.impl.launch.knot.KnotClient"
        assert merged["libraries"][0]["name"] == \
            "net.fabricmc:fabric-loader:0.16.9"
        assert len(merged["libraries"]) == len(version_1_20_1["libraries"]) + 1
        # base game args preserved
        assert "--username" in merged["arguments"]["game"]
        # base not mutated
        assert version_1_20_1["mainClass"] == "net.minecraft.client.main.Main"

    def test_merged_version_launches(self, version_1_20_1, tmp_path):
        override = {
            "id": "1.20.1-fabric-0.16.9",
            "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotClient",
            "arguments": {"game": []},
            "libraries": [
                {"name": "net.fabricmc:fabric-loader:0.16.9",
                 "url": "https://maven.fabricmc.net",
                 "downloads": {"artifact": {
                     "url": "https://maven.example/fabric-loader.jar",
                     "path": "net/fabricmc/fabric-loader/0.16.9/x.jar"}}},
            ],
        }
        merged = merge_versions(version_1_20_1, override)
        v = version_from_raw(merged)
        spec = LaunchSpec(
            game_dir=tmp_path, java_path="java", version=v,
            assets_root=tmp_path / "assets",
            libraries_dir=tmp_path / "libraries",
            natives_dir=tmp_path / "natives",
            primary_jar=tmp_path / "game.jar",
            auth={"player_name": "P", "uuid": "u", "access_token": "t",
                  "xuid": "", "user_type": "msa"},
            ram_mb=2048, env=WIN)
        import os
        cmd = spec.java_command()
        cp = cmd[cmd.index("-cp") + 1]
        assert any("fabric-loader" in p for p in cp.split(os.pathsep))
        assert "net.fabricmc.loader.impl.launch.knot.KnotClient" in cmd
