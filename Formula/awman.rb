class Awman < Formula
  desc "Run teams of coding agents through repeatable workflows from your terminal"
  homepage "https://prettysmart.dev/awman"
  version "0.14.0"
  on_macos do
    depends_on arch: :arm64
    on_arm do
      url "https://github.com/prettysmartdev/awman/releases/download/v#{version}/awman-macos-arm64"
      sha256 "f91589865fe695672ef2f1b18ff95effaae92f044e7cbcebee6af745bc5552e6"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/prettysmartdev/awman/releases/download/v#{version}/awman-linux-amd64"
      sha256 "ea6860596c5ab4597bcd0f2c751cf278dd8ec5aaed978dd574abedcae086beff"
    end
    on_arm do
      url "https://github.com/prettysmartdev/awman/releases/download/v#{version}/awman-linux-arm64"
      sha256 "9c2fa448d4a2bcbb2a8bc4c2a4e8791ffb4f8f0992da2e6efb397e8f2f0b2f9e"
    end
  end

  def install
    binary = if OS.mac?
      "awman-macos-arm64"
    elsif Hardware::CPU.arm?
      "awman-linux-arm64"
    else
      "awman-linux-amd64"
    end
    bin.install binary => "awman"
  end

  test do
    assert_equal "awman #{version}", shell_output("#{bin}/awman --version").strip
  end
end
