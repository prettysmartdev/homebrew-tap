class Awman < Formula
  desc "Run teams of coding agents through repeatable workflows from your terminal"
  homepage "https://prettysmart.dev/awman"
  version "0.14.0"
  on_macos do
    depends_on arch: :arm64
  end

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/prettysmartdev/awman/releases/download/v#{version}/awman-macos-arm64"
    sha256 "f91589865fe695672ef2f1b18ff95effaae92f044e7cbcebee6af745bc5552e6"
  end

  if OS.linux? && Hardware::CPU.intel?
    url "https://github.com/prettysmartdev/awman/releases/download/v#{version}/awman-linux-amd64"
    sha256 "ea6860596c5ab4597bcd0f2c751cf278dd8ec5aaed978dd574abedcae086beff"
  end

  if OS.linux? && Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
    url "https://github.com/prettysmartdev/awman/releases/download/v#{version}/awman-linux-arm64"
    sha256 "9c2fa448d4a2bcbb2a8bc4c2a4e8791ffb4f8f0992da2e6efb397e8f2f0b2f9e"
  end

  def install
    bin.install Dir["awman-*"].first => "awman"
  end

  test do
    # init and config work without a container runtime, unlike most commands.
    ENV["AWMAN_CONFIG_HOME"] = testpath/"awman"
    (testpath/"awman").mkpath
    system "git", "init"
    pipe_output("#{bin}/awman init --agent codex", "1\n")
    assert_path_exists testpath/"Dockerfile.dev"
  end
end
